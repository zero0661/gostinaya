import sqlite3 from 'sqlite3';
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const filename = fileURLToPath(import.meta.url);
const dirname = path.dirname(filename);
const projectRoot = process.env.GOSTINAYA_ROOT
  ? path.resolve(process.env.GOSTINAYA_ROOT)
  : path.resolve(dirname, '..');
const databasePath = path.join(projectRoot, 'database', 'gostinaya.db');
const dataPath = process.env.CUSDIS_IMPORT_DATA_PATH
  ? path.resolve(process.env.CUSDIS_IMPORT_DATA_PATH)
  : path.join(dirname, 'cusdis-comments-2026-08-12.json');
const backupDir = path.join(projectRoot, 'backups');
const migrationName = 'cusdis-comments-2026-08-12';

const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));

fs.mkdirSync(backupDir, { recursive: true });
const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupPath = path.join(backupDir, `before-${migrationName}-${timestamp}.db`);
fs.copyFileSync(databasePath, backupPath);

const db = new sqlite3.Database(databasePath);

const get = (sql, params = []) => new Promise((resolve, reject) => {
  db.get(sql, params, (error, row) => error ? reject(error) : resolve(row));
});

const run = (sql, params = []) => new Promise((resolve, reject) => {
  db.run(sql, params, function (error) {
    error ? reject(error) : resolve({ changes: this.changes, lastID: this.lastID });
  });
});

let transactionStarted = false;

try {
  const state = await get(`
    SELECT
      (SELECT COUNT(*) FROM guests WHERE role <> 'system') AS ordinary_accounts,
      (SELECT COUNT(*) FROM guests WHERE role = 'system') AS system_accounts,
      (SELECT COUNT(*) FROM discussion_messages) AS messages
  `);

  if (state.ordinary_accounts !== 0 || state.system_accounts !== 1 || state.messages !== 0) {
    throw new Error(`Unexpected database state: ${JSON.stringify(state)}`);
  }

  const expectedMessages = data.threads.reduce((sum, thread) => sum + thread.messages.length, 0);
  if (expectedMessages !== 10) {
    throw new Error(`Archive contains ${expectedMessages} messages; expected 10`);
  }

  await run('BEGIN IMMEDIATE TRANSACTION');
  transactionStarted = true;

  await run(`
    CREATE TABLE IF NOT EXISTS data_migrations (
      name TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  if (await get('SELECT name FROM data_migrations WHERE name = ?', [migrationName])) {
    throw new Error(`Migration ${migrationName} has already been applied`);
  }

  const authorIds = {};
  for (const [key, author] of Object.entries(data.authors)) {
    const passwordHash = await bcrypt.hash(crypto.randomBytes(48).toString('hex'), 12);
    const result = await run(
      `INSERT INTO guests (email, name, password_hash, role, language)
       VALUES (?, ?, ?, 'legacy', ?)`,
      [author.email, author.name, passwordHash, author.language]
    );
    authorIds[key] = result.lastID;
  }

  let imported = 0;
  for (const thread of data.threads) {
    const discussion = await get(
      `SELECT topic_id
       FROM article_discussions
       WHERE ghost_post_id_ru = ? OR ghost_post_id_en = ?`,
      [thread.pageId, thread.pageId]
    );

    if (!discussion) {
      throw new Error(`No article discussion found for Ghost post ${thread.pageId}`);
    }

    const importedIds = new Map();
    for (const message of thread.messages) {
      const parentMessageId = message.parentKey === null
        ? null
        : importedIds.get(message.parentKey);

      if (message.parentKey !== null && !parentMessageId) {
        throw new Error(`Missing parent ${message.parentKey} for message ${message.key}`);
      }

      const result = await run(
        `INSERT INTO discussion_messages
          (topic_id, author_id, parent_message_id, body, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          discussion.topic_id,
          authorIds[message.author],
          parentMessageId,
          message.body,
          message.createdAt,
          message.createdAt
        ]
      );

      importedIds.set(message.key, result.lastID);
      imported += 1;
    }
  }

  if (imported !== expectedMessages) {
    throw new Error(`Imported ${imported} messages; expected ${expectedMessages}`);
  }

  await run('INSERT INTO data_migrations (name) VALUES (?)', [migrationName]);
  await run('COMMIT');
  transactionStarted = false;

  const result = await get(`
    SELECT
      (SELECT COUNT(*) FROM guests WHERE role = 'legacy') AS legacy_authors,
      (SELECT COUNT(*) FROM discussion_messages) AS messages,
      (SELECT COUNT(*) FROM discussion_messages WHERE parent_message_id IS NULL) AS root_comments,
      (SELECT COUNT(*) FROM discussion_messages WHERE parent_message_id IS NOT NULL) AS replies
  `);

  console.log('Cusdis import completed:', result);
  console.log('Backup:', backupPath);
} catch (error) {
  if (transactionStarted) {
    try { await run('ROLLBACK'); } catch {}
  }
  console.error('Cusdis import failed:', error.message);
  console.error('Backup:', backupPath);
  process.exitCode = 1;
} finally {
  db.close();
}
