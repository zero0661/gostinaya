import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  createVerifiedDatabaseBackup,
  verifyDatabaseBackup
} from '../services/BackupService.js';

function createFixture(databasePath) {
  const database = new DatabaseSync(databasePath);
  database.exec(`
    CREATE TABLE guests (
      id INTEGER PRIMARY KEY,
      email TEXT,
      password_hash TEXT,
      email_verified_at TEXT
    );
    CREATE TABLE discussion_topics (id INTEGER PRIMARY KEY);
    CREATE TABLE discussion_messages (id INTEGER PRIMARY KEY, topic_id INTEGER);
    CREATE TABLE article_discussions (id INTEGER PRIMARY KEY);
    CREATE TABLE notifications (id INTEGER PRIMARY KEY);
    CREATE TABLE discussion_topic_reads (topic_id INTEGER);
    CREATE TABLE moderation_reports (id INTEGER PRIMARY KEY);
    CREATE TABLE moderation_actions (id INTEGER PRIMARY KEY);
    INSERT INTO guests VALUES (1, 'member@example.com', 'hash', '2026-08-17');
    INSERT INTO discussion_topics VALUES (11);
    INSERT INTO discussion_messages VALUES (21, 11);
  `);
  database.close();
}

test('creates a live SQLite snapshot and proves it can be restored', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'gostinaya-backup-test-'));
  const sourcePath = path.join(directory, 'source.db');
  const outputDirectory = path.join(directory, 'backups');

  try {
    createFixture(sourcePath);
    const sourceBefore = await readFile(sourcePath);
    const report = await createVerifiedDatabaseBackup({
      sourcePath,
      outputDirectory,
      now: new Date('2026-08-17T12:00:00Z')
    });

    assert.equal(report.integrity, 'ok');
    assert.equal(report.counts.guests, 1);
    assert.equal(report.counts.discussion_topics, 1);
    assert.equal(report.counts.discussion_messages, 1);
    assert.match(path.basename(report.backupPath), /^gostinaya-20260817T120000Z-[a-f0-9]{8}\.db$/);
    assert.deepEqual(await readFile(sourcePath), sourceBefore);
    assert.equal((await readdir(outputDirectory)).length, 1);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('rejects a corrupt backup and an incomplete database', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'gostinaya-restore-test-'));
  const corruptPath = path.join(directory, 'corrupt.db');
  const incompletePath = path.join(directory, 'incomplete.db');

  try {
    await writeFile(corruptPath, 'not a sqlite database');
    await assert.rejects(verifyDatabaseBackup(corruptPath));

    const incomplete = new DatabaseSync(incompletePath);
    incomplete.exec('CREATE TABLE guests (id INTEGER PRIMARY KEY)');
    incomplete.close();
    await assert.rejects(
      verifyDatabaseBackup(incompletePath),
      /Required column is missing|Required table is missing/
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
