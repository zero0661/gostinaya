import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';

const dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationPath = path.join(dirname, '..', 'database', 'migrate-notification-preferences.js');

function runMigration(databasePath, args = []) {
  return spawnSync(process.execPath, [migrationPath, ...args], {
    encoding: 'utf8',
    env: { ...process.env, GOSTINAYA_DB_PATH: databasePath }
  });
}

test('notification preference migration is dry-run safe and preserves existing e-mail delivery', async () => {
  const tempDirectory = await mkdtemp(path.join(os.tmpdir(), 'gostinaya-notifications-'));
  const databasePath = path.join(tempDirectory, 'test.db');

  try {
    const database = new DatabaseSync(databasePath);
    database.exec(`
      CREATE TABLE guests (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL
      );
      INSERT INTO guests (email, name) VALUES
        ('one@example.com', 'One'),
        ('two@example.com', 'Two');
    `);
    database.close();

    const dryRun = runMigration(databasePath);
    assert.equal(dryRun.status, 0, dryRun.stderr);
    assert.match(dryRun.stdout, /Mode: DRY RUN/);

    const afterDryRun = new DatabaseSync(databasePath);
    const dryColumns = afterDryRun.prepare('PRAGMA table_info(guests)').all().map(row => row.name);
    afterDryRun.close();
    assert.equal(dryColumns.includes('notify_email'), false);

    const apply = runMigration(databasePath, ['--apply']);
    assert.equal(apply.status, 0, apply.stderr);
    assert.match(apply.stdout, /Migration completed and verified/);

    const migrated = new DatabaseSync(databasePath);
    const existingRows = migrated.prepare(`
      SELECT notify_all_article_discussions, notify_email
      FROM guests
      ORDER BY id
    `).all().map(row => ({ ...row }));
    assert.deepEqual(existingRows, [
      { notify_all_article_discussions: 0, notify_email: 1 },
      { notify_all_article_discussions: 0, notify_email: 1 }
    ]);

    migrated.prepare("INSERT INTO guests (email, name) VALUES ('new@example.com', 'New')").run();
    const newRow = { ...migrated.prepare(`
      SELECT notify_all_article_discussions, notify_email
      FROM guests
      WHERE email = 'new@example.com'
    `).get() };
    migrated.close();
    assert.deepEqual(newRow, { notify_all_article_discussions: 0, notify_email: 0 });

    const backups = await readdir(path.join(tempDirectory, 'backups'));
    assert.equal(backups.length, 1);
    assert.match(backups[0], /^gostinaya-before-notification-preferences-\d+\.db$/);

    const rerun = runMigration(databasePath, ['--apply']);
    assert.equal(rerun.status, 0, rerun.stderr);
    assert.match(rerun.stdout, /Migration already applied; no changes made/);
  } finally {
    await rm(tempDirectory, { recursive: true, force: true });
  }
});
