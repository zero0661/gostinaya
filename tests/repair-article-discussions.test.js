import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import {
  applyArticleDiscussionRepair,
  inspectArticleDiscussions
} from '../scripts/repair-article-discussions.js';

function openDatabase(databasePath) {
  const database = new DatabaseSync(databasePath);
  return {
    async run(sql, params = []) {
      return database.prepare(sql).run(...params);
    },
    async all(sql, params = []) {
      return database.prepare(sql).all(...params);
    },
    async get(sql, params = []) {
      return database.prepare(sql).get(...params);
    },
    async close() {
      database.close();
    }
  };
}

test('repairs exact duplicates, preserves references, and removes empty links', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'gostinaya-article-repair-'));
  const databasePath = path.join(directory, 'gostinaya.db');
  const db = openDatabase(databasePath);

  try {
    await db.run('CREATE TABLE discussion_topics (id INTEGER PRIMARY KEY, created_at TEXT)');
    await db.run(`CREATE TABLE article_discussions (
      id INTEGER PRIMARY KEY, topic_id INTEGER UNIQUE,
      ghost_post_id_ru TEXT, ghost_post_id_en TEXT,
      url_ru TEXT, url_en TEXT, published_at TEXT,
      created_at TEXT, updated_at TEXT
    )`);
    await db.run('CREATE TABLE discussion_messages (id INTEGER PRIMARY KEY, topic_id INTEGER, body TEXT)');
    await db.run('CREATE TABLE notifications (id INTEGER PRIMARY KEY, topic_id INTEGER)');
    await db.run('CREATE TABLE discussion_topic_reads (id INTEGER PRIMARY KEY, guest_id INTEGER, topic_id INTEGER, last_read_message_id INTEGER, last_read_at TEXT, UNIQUE(guest_id, topic_id))');
    await db.run("INSERT INTO discussion_topics VALUES (10, '2026-01-01'), (20, '2026-02-01'), (30, '2026-03-01')");
    await db.run("INSERT INTO article_discussions VALUES (1, 10, 'ru', 'en', 'https://example/ru', 'https://example/en', NULL, NULL, NULL)");
    await db.run("INSERT INTO article_discussions VALUES (2, 20, 'ru', 'en', 'https://example/ru', 'https://example/en', NULL, NULL, NULL)");
    await db.run('INSERT INTO article_discussions VALUES (3, 30, NULL, NULL, NULL, NULL, NULL, NULL, NULL)');
    await db.run("INSERT INTO discussion_messages VALUES (100, 20, 'keep me')");
    await db.run('INSERT INTO notifications VALUES (1, 10), (2, 20), (3, 30)');
    await db.run("INSERT INTO discussion_topic_reads VALUES (1, 7, 10, 90, '2026-01-01'), (2, 7, 20, 100, '2026-02-01')");

    const preview = await inspectArticleDiscussions(db);
    assert.equal(preview.duplicates.length, 1);
    assert.equal(preview.empty.length, 1);
    assert.equal(preview.conflicts.length, 0);

    await applyArticleDiscussionRepair(db, preview);
    const result = await inspectArticleDiscussions(db);
    assert.equal(result.rows.length, 1);
    assert.equal(result.rows[0].topic_id, 20);

    assert.deepEqual(
      (await db.all('SELECT topic_id FROM discussion_messages')).map(row => ({ ...row })),
      [{ topic_id: 20 }]
    );
    assert.deepEqual(
      (await db.all('SELECT topic_id FROM notifications ORDER BY id')).map(row => ({ ...row })),
      [{ topic_id: 20 }, { topic_id: 20 }]
    );
    assert.deepEqual(
      (await db.all('SELECT topic_id, last_read_message_id FROM discussion_topic_reads')).map(row => ({ ...row })),
      [{ topic_id: 20, last_read_message_id: 100 }]
    );
    await assert.rejects(
      db.run("INSERT INTO article_discussions (topic_id, ghost_post_id_ru) VALUES (99, 'ru')"),
      /UNIQUE constraint failed/
    );
    await db.close();
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('repairs partial and transitive identity collisions and combines language data', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'gostinaya-partial-article-repair-'));
  const databasePath = path.join(directory, 'gostinaya.db');
  const db = openDatabase(databasePath);

  try {
    await db.run('CREATE TABLE discussion_topics (id INTEGER PRIMARY KEY, created_at TEXT)');
    await db.run(`CREATE TABLE article_discussions (
      id INTEGER PRIMARY KEY, topic_id INTEGER UNIQUE,
      ghost_post_id_ru TEXT, ghost_post_id_en TEXT,
      url_ru TEXT, url_en TEXT, published_at TEXT,
      created_at TEXT, updated_at TEXT
    )`);
    await db.run('CREATE TABLE discussion_messages (id INTEGER PRIMARY KEY, topic_id INTEGER, body TEXT)');
    await db.run("INSERT INTO discussion_topics VALUES (10, '2026-01-01'), (20, '2026-02-01'), (30, '2026-03-01')");
    await db.run("INSERT INTO article_discussions VALUES (1, 10, 'ru-id', NULL, 'https://example/ru', NULL, NULL, NULL, NULL)");
    await db.run("INSERT INTO article_discussions VALUES (2, 20, 'ru-id', 'en-id', 'https://example/ru', NULL, '2026-02-01', NULL, NULL)");
    await db.run("INSERT INTO article_discussions VALUES (3, 30, NULL, 'en-id', NULL, 'https://example/en', NULL, NULL, NULL)");
    await db.run("INSERT INTO discussion_messages VALUES (100, 30, 'keep the busiest topic')");

    const preview = await inspectArticleDiscussions(db);
    assert.equal(preview.duplicates.length, 1);
    assert.deepEqual(preview.duplicates[0].map(row => row.topic_id), [30, 10, 20]);
    assert.equal(preview.conflicts.length, 0);

    await applyArticleDiscussionRepair(db, preview);
    const result = await inspectArticleDiscussions(db);
    assert.equal(result.rows.length, 1);
    assert.equal(result.rows[0].topic_id, 30);
    assert.equal(result.rows[0].ghost_post_id_ru, 'ru-id');
    assert.equal(result.rows[0].ghost_post_id_en, 'en-id');
    assert.equal(result.rows[0].url_ru, 'https://example/ru');
    assert.equal(result.rows[0].url_en, 'https://example/en');
    assert.equal(result.rows[0].published_at, '2026-02-01');
    await db.close();
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('reports conflicting identities instead of silently discarding them', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'gostinaya-conflicting-article-repair-'));
  const db = openDatabase(path.join(directory, 'gostinaya.db'));

  try {
    await db.run('CREATE TABLE discussion_topics (id INTEGER PRIMARY KEY, created_at TEXT)');
    await db.run(`CREATE TABLE article_discussions (
      id INTEGER PRIMARY KEY, topic_id INTEGER UNIQUE,
      ghost_post_id_ru TEXT, ghost_post_id_en TEXT,
      url_ru TEXT, url_en TEXT, published_at TEXT,
      created_at TEXT, updated_at TEXT
    )`);
    await db.run('CREATE TABLE discussion_messages (id INTEGER PRIMARY KEY, topic_id INTEGER, body TEXT)');
    await db.run("INSERT INTO discussion_topics VALUES (10, '2026-01-01'), (20, '2026-02-01')");
    await db.run("INSERT INTO article_discussions VALUES (1, 10, 'ru-a', NULL, 'https://example/shared', NULL, NULL, NULL, NULL)");
    await db.run("INSERT INTO article_discussions VALUES (2, 20, 'ru-b', NULL, 'https://example/shared', NULL, NULL, NULL, NULL)");

    const preview = await inspectArticleDiscussions(db);
    assert.equal(preview.duplicates.length, 1);
    assert.deepEqual(preview.conflicts, [{
      topicIds: [10, 20],
      column: 'ghost_post_id_ru',
      values: ['ru-a', 'ru-b']
    }]);
    await db.close();
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
