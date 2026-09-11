import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';

const dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationPath = path.join(dirname, '..', 'database', 'migrate-newsletter-deliveries.js');

test('newsletter delivery migration is dry-run safe, backed up and idempotent', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'gostinaya-newsletter-'));
  const databasePath = path.join(directory, 'test.db');
  try {
    new DatabaseSync(databasePath).close();
    const run = args => spawnSync(process.execPath, [migrationPath, ...args], {
      encoding: 'utf8', env: { ...process.env, GOSTINAYA_DB_PATH: databasePath }
    });
    const dry = run([]);
    assert.equal(dry.status, 0, dry.stderr);
    assert.match(dry.stdout, /Mode: DRY RUN/);
    const afterDry = new DatabaseSync(databasePath);
    assert.equal(afterDry.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE name='newsletter_deliveries'").get().n, 0);
    afterDry.close();

    const apply = run(['--apply']);
    assert.equal(apply.status, 0, apply.stderr);
    assert.match(apply.stdout, /Migration completed and verified/);
    const backups = await readdir(path.join(directory, 'backups'));
    assert.equal(backups.length, 1);

    const rerun = run(['--apply']);
    assert.equal(rerun.status, 0, rerun.stderr);
    assert.match(rerun.stdout, /already applied/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
