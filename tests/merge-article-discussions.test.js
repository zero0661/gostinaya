import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import sqlite3 from 'sqlite3';

const dir = await mkdtemp(path.join(os.tmpdir(), 'gostinaya-merge-'));
const databasePath = path.join(dir, 'gostinaya.db');
process.env.GOSTINAYA_DB_PATH = databasePath;
const { default: ArticleDiscussionRepository } = await import('../repositories/ArticleDiscussionRepository.js');
const db = new sqlite3.Database(databasePath);
const run = (sql, params = []) => new Promise((resolve, reject) => db.run(sql, params, error => error ? reject(error) : resolve()));
const all = (sql, params = []) => new Promise((resolve, reject) => db.all(sql, params, (error, rows) => error ? reject(error) : resolve(rows)));

try {
  await run('CREATE TABLE discussion_topics (id INTEGER PRIMARY KEY, created_at TEXT)');
  await run('CREATE TABLE article_discussions (id INTEGER PRIMARY KEY, topic_id INTEGER UNIQUE, ghost_post_id_ru TEXT, ghost_post_id_en TEXT, url_ru TEXT, url_en TEXT, published_at TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP, updated_at TEXT)');
  await run('CREATE TABLE discussion_messages (id INTEGER PRIMARY KEY, topic_id INTEGER, parent_message_id INTEGER, body TEXT)');
  await run('CREATE TABLE notifications (id INTEGER PRIMARY KEY, topic_id INTEGER, message_id INTEGER)');
  await run('CREATE TABLE discussion_topic_reads (id INTEGER PRIMARY KEY, guest_id INTEGER, topic_id INTEGER, last_read_message_id INTEGER, last_read_at TEXT, UNIQUE(guest_id, topic_id))');
  await run("INSERT INTO discussion_topics VALUES (10, '2026-01-01'), (20, '2026-02-01')");
  await run("INSERT INTO article_discussions (topic_id, ghost_post_id_ru, url_ru) VALUES (10, 'ru', 'https://example/ru')");
  await run("INSERT INTO article_discussions (topic_id, ghost_post_id_en, url_en) VALUES (20, 'en', 'https://example/en')");
  await run("INSERT INTO discussion_messages VALUES (101, 20, NULL, 'first'), (102, 20, 101, 'reply')");
  await run('INSERT INTO notifications VALUES (1, 20, 102)');
  await run("INSERT INTO discussion_topic_reads (guest_id, topic_id, last_read_message_id, last_read_at) VALUES (7, 10, 90, '2026-01-01'), (7, 20, 102, '2026-02-01')");

  await ArticleDiscussionRepository.mergeTopics({
    primaryTopicId: 10, duplicateTopicId: 20,
    languageVersion: { ghostPostIdRu: 'ru', ghostPostIdEn: 'en', urlRu: 'https://example/ru', urlEn: 'https://example/en', publishedAt: '2026-01-01' }
  });
  assert.deepEqual((await all('SELECT topic_id, parent_message_id FROM discussion_messages ORDER BY id')), [{ topic_id: 10, parent_message_id: null }, { topic_id: 10, parent_message_id: 101 }]);
  assert.equal((await all('SELECT topic_id FROM notifications'))[0].topic_id, 10);
  assert.equal((await all('SELECT * FROM discussion_topics WHERE id = 20')).length, 0);
  const discussion = (await all('SELECT * FROM article_discussions'))[0];
  assert.equal(discussion.ghost_post_id_en, 'en');
  assert.equal((await all('SELECT * FROM discussion_topic_reads WHERE guest_id = 7 AND topic_id = 10'))[0].last_read_message_id, 102);
  console.log('merge-article-discussions: passed');
} finally {
  db.close();
  await rm(dir, { recursive: true, force: true });
}
