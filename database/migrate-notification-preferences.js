import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';

const filename = fileURLToPath(import.meta.url);
const dirname = path.dirname(filename);
const databasePath = process.env.GOSTINAYA_DB_PATH || path.join(dirname, 'gostinaya.db');
const apply = process.argv.includes('--apply');

const columns = [
  ['notify_all_article_discussions', 'INTEGER NOT NULL DEFAULT 0'],
  ['notify_email', 'INTEGER NOT NULL DEFAULT 0']
];

function sqlString(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function timestamp() {
  return new Date().toISOString().replace(/[-:T]/g, '').replace(/\..+/, '');
}

const database = new DatabaseSync(databasePath);

try {
  const existing = new Set(
    database.prepare('PRAGMA table_info(guests)').all().map(row => row.name)
  );
  const missing = columns.filter(([name]) => !existing.has(name));
  const guestSummary = database.prepare(`
    SELECT COUNT(*) AS total, COALESCE(MAX(id), 0) AS max_id
    FROM guests
  `).get();
  const guests = Number(guestSummary.total);
  const existingMaxId = Number(guestSummary.max_id);

  console.log(`Mode: ${apply ? 'APPLY' : 'DRY RUN'}`);
  console.log(`Database: ${databasePath}`);
  console.log(`Existing accounts: ${guests}`);
  console.log(`Columns to add: ${missing.length ? missing.map(([name]) => name).join(', ') : 'none'}`);

  if (!apply) {
    console.log('No changes made. Run again with --apply to back up and migrate.');
    process.exitCode = 0;
  } else if (!missing.length) {
    console.log('Migration already applied; no changes made.');
  } else {
    const backupDirectory = path.join(path.dirname(databasePath), 'backups');
    mkdirSync(backupDirectory, { recursive: true });
    const backupPath = path.join(
      backupDirectory,
      `gostinaya-before-notification-preferences-${timestamp()}.db`
    );
    database.exec(`VACUUM INTO ${sqlString(backupPath)}`);
    console.log(`Backup: ${backupPath}`);

    const addsEmailPreference = !existing.has('notify_email');
    database.exec('BEGIN IMMEDIATE');
    try {
      for (const [name, definition] of missing) {
        database.exec(`ALTER TABLE guests ADD COLUMN ${name} ${definition}`);
      }
      if (addsEmailPreference) {
        database.exec('UPDATE guests SET notify_email = 1');
      }
      database.exec('COMMIT');
    } catch (error) {
      database.exec('ROLLBACK');
      throw error;
    }

    const migrated = new Set(
      database.prepare('PRAGMA table_info(guests)').all().map(row => row.name)
    );
    const stillMissing = columns.filter(([name]) => !migrated.has(name));
    const existingEmailDisabled = addsEmailPreference
      ? Number(database.prepare(`
          SELECT COUNT(*) AS total
          FROM guests
          WHERE id <= ? AND notify_email != 1
        `).get(existingMaxId).total)
      : 0;

    if (stillMissing.length || existingEmailDisabled !== 0) {
      throw new Error('Post-migration verification failed.');
    }

    console.log(`Existing accounts with e-mail enabled: ${addsEmailPreference ? guests : 0}`);
    console.log('Migration completed and verified.');
  }
} finally {
  database.close();
}
