import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';

const dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationPath = path.join(dirname, '..', 'database', 'migrate-moderation.js');

function runMigration(databasePath, args = []) {
  return spawnSync(process.execPath, [migrationPath, ...args], {
    encoding: 'utf8',
    env: { ...process.env, GOSTINAYA_DB_PATH: databasePath }
  });
}

test('moderation migration is dry-run safe, backed up and idempotent', async () => {
  const tempDirectory = await mkdtemp(path.join(os.tmpdir(), 'gostinaya-moderation-'));
  const databasePath = path.join(tempDirectory, 'test.db');

  try {
    const database = new DatabaseSync(databasePath);
    database.exec(`
      CREATE TABLE guests (id INTEGER PRIMARY KEY, email TEXT, name TEXT, role TEXT);
      CREATE TABLE discussion_topics (id INTEGER PRIMARY KEY, title TEXT, pinned INTEGER DEFAULT 0, closed INTEGER DEFAULT 0);
      CREATE TABLE discussion_messages (id INTEGER PRIMARY KEY, topic_id INTEGER, body TEXT);
      INSERT INTO guests VALUES (1, 'one@example.com', 'One', 'guest');
    `);
    database.close();

    const dryRun = runMigration(databasePath);
    assert.equal(dryRun.status, 0, dryRun.stderr);
    assert.match(dryRun.stdout, /Mode: DRY RUN/);

    const dryDatabase = new DatabaseSync(databasePath);
    assert.equal(dryDatabase.prepare("SELECT 1 FROM sqlite_master WHERE name = 'moderation_reports'").get(), undefined);
    dryDatabase.close();

    const apply = runMigration(databasePath, ['--apply']);
    assert.equal(apply.status, 0, apply.stderr);
    assert.match(apply.stdout, /Migration completed and verified/);

    const migrated = new DatabaseSync(databasePath);
    const guest = { ...migrated.prepare('SELECT is_blocked, blocked_reason FROM guests WHERE id = 1').get() };
    assert.deepEqual(guest, { is_blocked: 0, blocked_reason: '' });
    assert.ok(migrated.prepare("SELECT 1 FROM sqlite_master WHERE name = 'moderation_reports'").get());
    assert.ok(migrated.prepare("SELECT 1 FROM sqlite_master WHERE name = 'moderation_actions'").get());
    migrated.close();

    const backups = await readdir(path.join(tempDirectory, 'backups'));
    assert.equal(backups.length, 1);
    assert.match(backups[0], /^gostinaya-before-moderation-\d+\.db$/);

    const rerun = runMigration(databasePath, ['--apply']);
    assert.equal(rerun.status, 0, rerun.stderr);
    assert.match(rerun.stdout, /Migration already applied/);
  } finally {
    await rm(tempDirectory, { recursive: true, force: true });
  }
});
