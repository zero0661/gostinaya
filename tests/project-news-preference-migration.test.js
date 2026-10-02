import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';

test('news preference split preserves choices, backs up, and never overwrites later choices', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'news-preference-'));
  const databasePath = path.join(directory, 'test.db');
  const migration = new URL('../database/migrate-project-news-preference.js', import.meta.url);
  const run = (...args) => spawnSync(process.execPath, [migration.pathname, ...args], {
    encoding: 'utf8', env: { ...process.env, GOSTINAYA_DB_PATH: databasePath }
  });
  try {
    const before = new DatabaseSync(databasePath);
    before.exec('CREATE TABLE guests (id INTEGER PRIMARY KEY, notify_new_topics INTEGER NOT NULL DEFAULT 0, notify_email INTEGER NOT NULL DEFAULT 0); INSERT INTO guests VALUES (1, 1, 1), (2, 0, 1), (3, 1, 0)');
    before.close();
    const dryRun = run();
    assert.equal(dryRun.status, 0, dryRun.stderr);
    const afterDryRun = new DatabaseSync(databasePath);
    assert.equal(afterDryRun.prepare('PRAGMA table_info(guests)').all().some(row => row.name === 'notify_project_news'), false);
    afterDryRun.close();
    const applied = run('--apply');
    assert.equal(applied.status, 0, applied.stderr);
    const db = new DatabaseSync(databasePath);
    assert.deepEqual(db.prepare('SELECT notify_new_topics, notify_project_news, notify_email FROM guests ORDER BY id').all().map(row => ({ ...row })), [
      { notify_new_topics: 1, notify_project_news: 1, notify_email: 1 },
      { notify_new_topics: 0, notify_project_news: 0, notify_email: 1 },
      { notify_new_topics: 1, notify_project_news: 1, notify_email: 0 }
    ]);
    db.exec('UPDATE guests SET notify_project_news = 0 WHERE id = 1; UPDATE guests SET notify_project_news = 1 WHERE id = 2; INSERT INTO guests (id) VALUES (4)');
    db.close();
    const rerun = run('--apply');
    assert.equal(rerun.status, 0, rerun.stderr);
    const after = new DatabaseSync(databasePath);
    assert.deepEqual(after.prepare('SELECT notify_project_news FROM guests ORDER BY id').all().map(row => row.notify_project_news), [0, 1, 1, 0]);
    after.close();
    const backups = await readdir(path.join(directory, 'backups'));
    assert.equal(backups.length, 1);
    const backup = new DatabaseSync(path.join(directory, 'backups', backups[0]));
    assert.equal(backup.prepare('PRAGMA table_info(guests)').all().some(row => row.name === 'notify_project_news'), false);
    assert.equal(backup.prepare('SELECT COUNT(*) AS total FROM guests').get().total, 3);
    backup.close();
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
