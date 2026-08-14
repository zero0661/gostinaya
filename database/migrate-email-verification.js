import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';

const filename = fileURLToPath(import.meta.url);
const dirname = path.dirname(filename);
const databasePath = path.join(dirname, 'gostinaya.db');
const apply = process.argv.includes('--apply');

const columns = [
  ['email_verified_at', 'TEXT'],
  ['email_verification_token_hash', 'TEXT'],
  ['email_verification_expires_at', 'INTEGER'],
  ['email_verification_sent_at', 'INTEGER']
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
  const guests = Number(database.prepare('SELECT COUNT(*) AS total FROM guests').get().total);

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
    const backupDirectory = path.join(dirname, 'backups');
    mkdirSync(backupDirectory, { recursive: true });
    const backupPath = path.join(
      backupDirectory,
      `gostinaya-before-email-verification-${timestamp()}.db`
    );
    database.exec(`VACUUM INTO ${sqlString(backupPath)}`);
    console.log(`Backup: ${backupPath}`);

    const addsVerifiedColumn = !existing.has('email_verified_at');
    database.exec('BEGIN IMMEDIATE');
    try {
      for (const [name, definition] of missing) {
        database.exec(`ALTER TABLE guests ADD COLUMN ${name} ${definition}`);
      }
      if (addsVerifiedColumn) {
        database.exec(`
          UPDATE guests
          SET email_verified_at = CURRENT_TIMESTAMP
          WHERE email_verified_at IS NULL
        `);
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
    const unverified = Number(database.prepare(`
      SELECT COUNT(*) AS total
      FROM guests
      WHERE email_verified_at IS NULL
    `).get().total);

    if (stillMissing.length || (addsVerifiedColumn && unverified !== 0)) {
      throw new Error('Post-migration verification failed.');
    }

    console.log(`Verified existing accounts: ${addsVerifiedColumn ? guests : 0}`);
    console.log('Migration completed and verified.');
  }
} finally {
  database.close();
}
