import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const execFileAsync = promisify(execFile);
const projectRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

test('mergeTopics combines separate RU and EN rows with unique indexes', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'gostinaya-pair-merge-'));
  const databasePath = path.join(directory, 'gostinaya.db');
  const database = new DatabaseSync(databasePath);

  try {
    database.exec(`
      CREATE TABLE discussion_topics (id INTEGER PRIMARY KEY);
      CREATE TABLE article_discussions (
        id INTEGER PRIMARY KEY,
        topic_id INTEGER UNIQUE,
        ghost_post_id_ru TEXT,
        ghost_post_id_en TEXT,
        url_ru TEXT,
        url_en TEXT,
        published_at TEXT,
        created_at TEXT,
        updated_at TEXT
      );
      CREATE UNIQUE INDEX idx_article_discussions_ghost_post_id_ru
        ON article_discussions(ghost_post_id_ru) WHERE ghost_post_id_ru IS NOT NULL;
      CREATE UNIQUE INDEX idx_article_discussions_ghost_post_id_en
        ON article_discussions(ghost_post_id_en) WHERE ghost_post_id_en IS NOT NULL;
      CREATE UNIQUE INDEX idx_article_discussions_url_ru
        ON article_discussions(url_ru) WHERE url_ru IS NOT NULL;
      CREATE UNIQUE INDEX idx_article_discussions_url_en
        ON article_discussions(url_en) WHERE url_en IS NOT NULL;
      CREATE TABLE discussion_messages (id INTEGER PRIMARY KEY, topic_id INTEGER);
      CREATE TABLE notifications (id INTEGER PRIMARY KEY, topic_id INTEGER);
      CREATE TABLE discussion_topic_reads (
        id INTEGER PRIMARY KEY,
        guest_id INTEGER,
        topic_id INTEGER,
        last_read_message_id INTEGER,
        last_read_at TEXT,
        UNIQUE(guest_id, topic_id)
      );
      INSERT INTO discussion_topics VALUES (10), (20);
      INSERT INTO article_discussions
        (id, topic_id, ghost_post_id_ru, url_ru)
        VALUES (1, 10, 'ru-id', 'https://example.test/ru/');
      INSERT INTO article_discussions
        (id, topic_id, ghost_post_id_en, url_en)
        VALUES (2, 20, 'en-id', 'https://example.test/en/');
      INSERT INTO discussion_messages VALUES (1, 20);
      INSERT INTO notifications VALUES (1, 20);
      INSERT INTO discussion_topic_reads VALUES
        (1, 7, 10, 1, '2026-01-01'),
        (2, 7, 20, 2, '2026-02-01');
    `);
    database.close();

    const script = `
      const { default: repository } = await import('./repositories/ArticleDiscussionRepository.js');
      await repository.mergeTopics({
        primaryTopicId: 10,
        duplicateTopicId: 20,
        languageVersion: {
          ghostPostIdRu: 'ru-id',
          ghostPostIdEn: 'en-id',
          urlRu: 'https://example.test/ru/',
          urlEn: 'https://example.test/en/',
          publishedAt: '2026-08-24'
        }
      });
      process.exit(0);
    `;
    await execFileAsync(process.execPath, ['--input-type=module', '-e', script], {
      cwd: projectRoot,
      env: { ...process.env, GOSTINAYA_DB_PATH: databasePath }
    });

    const verified = new DatabaseSync(databasePath);
    assert.deepEqual(
      { ...verified.prepare('SELECT topic_id, ghost_post_id_ru, ghost_post_id_en, url_ru, url_en FROM article_discussions').get() },
      {
        topic_id: 10,
        ghost_post_id_ru: 'ru-id',
        ghost_post_id_en: 'en-id',
        url_ru: 'https://example.test/ru/',
        url_en: 'https://example.test/en/'
      }
    );
    assert.equal(verified.prepare('SELECT topic_id FROM discussion_messages').get().topic_id, 10);
    assert.equal(verified.prepare('SELECT topic_id FROM notifications').get().topic_id, 10);
    assert.deepEqual(
      { ...verified.prepare('SELECT topic_id, last_read_message_id FROM discussion_topic_reads').get() },
      { topic_id: 10, last_read_message_id: 2 }
    );
    assert.equal(verified.prepare('SELECT COUNT(*) AS count FROM discussion_topics WHERE id = 20').get().count, 0);
    verified.close();
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
