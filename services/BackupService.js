import { DatabaseSync } from 'node:sqlite';
import { copyFile, mkdir, mkdtemp, rm, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

const REQUIRED_SCHEMA = {
  guests: ['id', 'email', 'password_hash', 'email_verified_at'],
  discussion_topics: ['id'],
  discussion_messages: ['id', 'topic_id'],
  article_discussions: ['id'],
  notifications: ['id'],
  discussion_topic_reads: ['topic_id'],
  moderation_reports: ['id'],
  moderation_actions: ['id']
};

function sqlString(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function timestamp(date = new Date()) {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

async function assertRegularNonemptyFile(filePath) {
  const details = await stat(filePath);
  if (!details.isFile() || details.size === 0) {
    throw new Error(`Backup is not a non-empty file: ${filePath}`);
  }
  return details.size;
}

export async function verifyDatabaseBackup(backupPath) {
  const resolvedBackup = path.resolve(backupPath);
  const bytes = await assertRegularNonemptyFile(resolvedBackup);
  const restoreDirectory = await mkdtemp(path.join(os.tmpdir(), 'gostinaya-restore-check-'));
  const restoredPath = path.join(restoreDirectory, 'gostinaya-restored.db');
  let database;

  try {
    await copyFile(resolvedBackup, restoredPath);
    database = new DatabaseSync(restoredPath, { readOnly: true });

    const integrity = database.prepare('PRAGMA quick_check').get();
    if (integrity?.quick_check !== 'ok') {
      throw new Error(`SQLite quick_check failed: ${integrity?.quick_check || 'unknown error'}`);
    }

    const tableRows = database.prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table'"
    ).all();
    const tables = new Set(tableRows.map(row => row.name));

    for (const [table, requiredColumns] of Object.entries(REQUIRED_SCHEMA)) {
      if (!tables.has(table)) throw new Error(`Required table is missing: ${table}`);
      const columns = new Set(
        database.prepare(`PRAGMA table_info(${table})`).all().map(row => row.name)
      );
      for (const column of requiredColumns) {
        if (!columns.has(column)) {
          throw new Error(`Required column is missing: ${table}.${column}`);
        }
      }
    }

    const counts = {};
    for (const table of Object.keys(REQUIRED_SCHEMA)) {
      counts[table] = Number(database.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get().count);
    }

    return {
      backupPath: resolvedBackup,
      bytes,
      integrity: 'ok',
      tables: Object.keys(REQUIRED_SCHEMA),
      counts
    };
  } finally {
    database?.close();
    await rm(restoreDirectory, { recursive: true, force: true });
  }
}

export async function createVerifiedDatabaseBackup({
  sourcePath,
  outputDirectory,
  now = new Date()
}) {
  const resolvedSource = path.resolve(sourcePath);
  await assertRegularNonemptyFile(resolvedSource);
  const resolvedOutputDirectory = path.resolve(outputDirectory);
  await mkdir(resolvedOutputDirectory, { recursive: true });
  const backupPath = path.join(
    resolvedOutputDirectory,
    `gostinaya-${timestamp(now)}-${randomUUID().slice(0, 8)}.db`
  );
  const database = new DatabaseSync(resolvedSource, { readOnly: true });

  try {
    database.exec(`VACUUM INTO ${sqlString(backupPath)}`);
  } finally {
    database.close();
  }

  try {
    return await verifyDatabaseBackup(backupPath);
  } catch (error) {
    await rm(backupPath, { force: true });
    throw error;
  }
}
