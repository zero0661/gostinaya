import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';

const dirname = path.dirname(fileURLToPath(import.meta.url));
const scriptPath = path.join(dirname, '..', 'scripts', 'set-guest-role.js');

function run(databasePath, args) {
  return spawnSync(process.execPath, [scriptPath, ...args], {
    encoding: 'utf8',
    env: { ...process.env, GOSTINAYA_DB_PATH: databasePath }
  });
}

test('role assignment is dry-run safe, backed up and verified', async () => {
  const tempDirectory = await mkdtemp(path.join(os.tmpdir(), 'gostinaya-role-'));
  const databasePath = path.join(tempDirectory, 'test.db');
  try {
    const database = new DatabaseSync(databasePath);
    database.exec(`
      CREATE TABLE guests (
        id INTEGER PRIMARY KEY,
        email TEXT,
        name TEXT,
        role TEXT,
        email_verified_at TEXT
      );
      INSERT INTO guests VALUES (1, 'owner@example.com', 'Owner', 'guest', CURRENT_TIMESTAMP);
    `);
    database.close();

    const dryRun = run(databasePath, ['--email', 'owner@example.com', '--role', 'moderator']);
    assert.equal(dryRun.status, 0, dryRun.stderr);
    assert.match(dryRun.stdout, /guest -> moderator/);
    const unchanged = new DatabaseSync(databasePath);
    assert.equal(unchanged.prepare('SELECT role FROM guests WHERE id = 1').get().role, 'guest');
    unchanged.close();

    const apply = run(databasePath, ['--email', 'owner@example.com', '--role', 'moderator', '--apply']);
    assert.equal(apply.status, 0, apply.stderr);
    assert.match(apply.stdout, /Role updated and verified/);
    const changed = new DatabaseSync(databasePath);
    assert.equal(changed.prepare('SELECT role FROM guests WHERE id = 1').get().role, 'moderator');
    changed.close();

    const backups = await readdir(path.join(tempDirectory, 'backups'));
    assert.equal(backups.length, 1);
  } finally {
    await rm(tempDirectory, { recursive: true, force: true });
  }
});
