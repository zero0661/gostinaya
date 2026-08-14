import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';

const dirname = path.dirname(fileURLToPath(import.meta.url));
const databasePath = process.env.GOSTINAYA_DB_PATH || path.join(dirname, 'gostinaya.db');
const apply = process.argv.includes('--apply');

const columns = {
  guests: [
    ['is_blocked', 'INTEGER NOT NULL DEFAULT 0'],
    ['blocked_at', 'TEXT'],
    ['blocked_by', 'INTEGER'],
    ['blocked_reason', "TEXT NOT NULL DEFAULT ''"]
  ],
  discussion_topics: [
    ['hidden_at', 'TEXT'],
    ['hidden_by', 'INTEGER'],
    ['hidden_reason', "TEXT NOT NULL DEFAULT ''"]
  ],
  discussion_messages: [
    ['hidden_at', 'TEXT'],
    ['hidden_by', 'INTEGER'],
    ['hidden_reason', "TEXT NOT NULL DEFAULT ''"]
  ]
};

function sqlString(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function timestamp() {
  return new Date().toISOString().replace(/[-:T]/g, '').replace(/\..+/, '');
}

function tableExists(database, table) {
  return Boolean(database.prepare(
    "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?"
  ).get(table));
}

function tableColumns(database, table) {
  return new Set(database.prepare(`PRAGMA table_info(${table})`).all().map(row => row.name));
}

const database = new DatabaseSync(databasePath);

try {
  for (const table of Object.keys(columns)) {
    if (!tableExists(database, table)) throw new Error(`Required table is missing: ${table}`);
  }

  const missing = [];
  for (const [table, definitions] of Object.entries(columns)) {
    const existing = tableColumns(database, table);
    for (const [name, definition] of definitions) {
      if (!existing.has(name)) missing.push({ table, name, definition });
    }
  }
  const missingTables = ['moderation_reports', 'moderation_actions']
    .filter(table => !tableExists(database, table));

  console.log(`Mode: ${apply ? 'APPLY' : 'DRY RUN'}`);
  console.log(`Database: ${databasePath}`);
  console.log(`Columns to add: ${missing.length ? missing.map(item => `${item.table}.${item.name}`).join(', ') : 'none'}`);
  console.log(`Tables to create: ${missingTables.length ? missingTables.join(', ') : 'none'}`);

  if (!apply) {
    console.log('No changes made. Run again with --apply to back up and migrate.');
  } else if (!missing.length && !missingTables.length) {
    console.log('Migration already applied; no changes made.');
  } else {
    const backupDirectory = path.join(path.dirname(databasePath), 'backups');
    mkdirSync(backupDirectory, { recursive: true });
    const backupPath = path.join(backupDirectory, `gostinaya-before-moderation-${timestamp()}.db`);
    database.exec(`VACUUM INTO ${sqlString(backupPath)}`);
    console.log(`Backup: ${backupPath}`);

    database.exec('BEGIN IMMEDIATE');
    try {
      for (const item of missing) {
        database.exec(`ALTER TABLE ${item.table} ADD COLUMN ${item.name} ${item.definition}`);
      }

      database.exec(`
        CREATE TABLE IF NOT EXISTS moderation_reports (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          reporter_id INTEGER NOT NULL,
          topic_id INTEGER,
          message_id INTEGER,
          reason TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'open',
          reviewed_by INTEGER,
          reviewed_at TEXT,
          resolution_note TEXT NOT NULL DEFAULT '',
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CHECK (topic_id IS NOT NULL OR message_id IS NOT NULL)
        );
        CREATE INDEX IF NOT EXISTS idx_moderation_reports_status
          ON moderation_reports(status, created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_moderation_reports_target
          ON moderation_reports(topic_id, message_id);

        CREATE TABLE IF NOT EXISTS moderation_actions (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          actor_id INTEGER NOT NULL,
          actor_name TEXT NOT NULL,
          action TEXT NOT NULL,
          target_type TEXT NOT NULL,
          target_id INTEGER NOT NULL,
          details TEXT NOT NULL DEFAULT '',
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_moderation_actions_created
          ON moderation_actions(created_at DESC);
      `);
      database.exec('COMMIT');
    } catch (error) {
      database.exec('ROLLBACK');
      throw error;
    }

    const stillMissing = missing.filter(item => !tableColumns(database, item.table).has(item.name));
    const tablesStillMissing = ['moderation_reports', 'moderation_actions']
      .filter(table => !tableExists(database, table));
    if (stillMissing.length || tablesStillMissing.length) {
      throw new Error('Post-migration verification failed.');
    }
    console.log('Migration completed and verified.');
  }
} finally {
  database.close();
}
