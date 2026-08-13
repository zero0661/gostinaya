import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';

const script = path.resolve('scripts/delete-guest-accounts.js');
const emails = ['first@example.com', 'second@example.com'];

function createDatabase(file) {
  const database = new DatabaseSync(file);
  database.exec(`
    CREATE TABLE guests (
      id INTEGER PRIMARY KEY, email TEXT UNIQUE, name TEXT, password_hash TEXT,
      role TEXT, language TEXT
    );
    CREATE TABLE discussion_topics (
      id INTEGER PRIMARY KEY, room TEXT, title TEXT, author_id INTEGER
    );
    CREATE TABLE discussion_messages (
      id INTEGER PRIMARY KEY, topic_id INTEGER, author_id INTEGER,
      parent_message_id INTEGER, body TEXT
    );
    CREATE TABLE article_discussions (topic_id INTEGER PRIMARY KEY);
    CREATE TABLE notifications (
      id INTEGER PRIMARY KEY, recipient_id INTEGER, actor_id INTEGER,
      topic_id INTEGER, message_id INTEGER
    );
    CREATE TABLE discussion_topic_reads (
      id INTEGER PRIMARY KEY, guest_id INTEGER, topic_id INTEGER
    );

    INSERT INTO guests VALUES (1, 'system@example.invalid', 'System', 'x', 'system', 'ru');
    INSERT INTO guests VALUES (2, 'first@example.com', 'First', 'x', 'guest', 'ru');
    INSERT INTO guests VALUES (3, 'second@example.com', 'Second', 'x', 'guest', 'ru');
    INSERT INTO guests VALUES (4, 'other@example.com', 'Other', 'x', 'guest', 'ru');

    INSERT INTO discussion_topics VALUES (10, 'articles', 'Article discussion', 2);
    INSERT INTO discussion_topics VALUES (11, 'community', 'Empty test topic', 3);
    INSERT INTO article_discussions VALUES (10);

    INSERT INTO discussion_messages VALUES (100, 10, 2, NULL, 'Test message');
    INSERT INTO discussion_messages VALUES (101, 10, 4, 100, 'Preserved reply');
    INSERT INTO notifications VALUES (200, 2, 4, 10, 101);
    INSERT INTO notifications VALUES (201, 4, 2, 10, 100);
    INSERT INTO discussion_topic_reads VALUES (300, 2, 10);
  `);
  database.close();
}

function run(databasePath, apply = false) {
  const args = [script];
  for (const email of emails) args.push('--email', email);
  if (apply) args.push('--apply');
  return spawnSync(process.execPath, args, {
    env: { ...process.env, GOSTINAYA_DB_PATH: databasePath },
    encoding: 'utf8'
  });
}

test('deletes selected accounts without damaging article discussions or other replies', () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'gostinaya-delete-accounts-'));
  const databasePath = path.join(directory, 'gostinaya.db');
  createDatabase(databasePath);

  try {
    const dryRun = run(databasePath);
    assert.equal(dryRun.status, 0, dryRun.stderr);
    assert.match(dryRun.stdout, /Accounts found: 2/);
    assert.match(dryRun.stdout, /Topics to preserve: 1/);
    assert.match(dryRun.stdout, /Topics to delete: 1/);

    let database = new DatabaseSync(databasePath);
    assert.equal(database.prepare('SELECT COUNT(*) AS total FROM guests').get().total, 4);
    database.close();

    const applied = run(databasePath, true);
    assert.equal(applied.status, 0, applied.stderr);
    assert.match(applied.stdout, /Account deletion completed and verified/);

    database = new DatabaseSync(databasePath);
    assert.equal(database.prepare('SELECT COUNT(*) AS total FROM guests WHERE id IN (2, 3)').get().total, 0);
    assert.equal(database.prepare('SELECT author_id FROM discussion_topics WHERE id = 10').get().author_id, 1);
    assert.equal(database.prepare('SELECT COUNT(*) AS total FROM discussion_topics WHERE id = 11').get().total, 0);
    assert.equal(database.prepare('SELECT COUNT(*) AS total FROM discussion_messages WHERE id = 100').get().total, 0);
    assert.equal(database.prepare('SELECT parent_message_id FROM discussion_messages WHERE id = 101').get().parent_message_id, null);
    assert.equal(database.prepare('SELECT COUNT(*) AS total FROM notifications').get().total, 0);
    assert.equal(database.prepare('SELECT COUNT(*) AS total FROM discussion_topic_reads').get().total, 0);
    database.close();
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
