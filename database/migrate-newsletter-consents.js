import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';

const dirname = path.dirname(fileURLToPath(import.meta.url));
const databasePath = process.env.GOSTINAYA_DB_PATH || path.join(dirname, 'gostinaya.db');
const apply = process.argv.includes('--apply');

function sqlString(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function timestamp() {
  return new Date().toISOString().replace(/[-:T]/g, '').replace(/\..+/, '');
}

function tableExists(database, name) {
  return Boolean(database.prepare(
    "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?"
  ).get(name));
}

const database = new DatabaseSync(databasePath);

try {
  console.log(`Mode: ${apply ? 'APPLY' : 'DRY RUN'}`);
  console.log(`Database: ${databasePath}`);
  const missing = ['newsletter_consents'].filter(name => !tableExists(database, name));
  const needsRevocation = !missing.length && !database.prepare('PRAGMA table_info(newsletter_consents)').all().some(column => column.name === 'revoked_at');
  console.log(`Tables to create: ${missing.length ? missing.join(', ') : 'none'}`);

  if (!apply) {
    console.log('No changes made. Run again with --apply to back up and migrate.');
  } else if (!missing.length && !needsRevocation) {
    console.log('Migration already applied; no changes made.');
  } else {
    const backupDirectory = path.join(path.dirname(databasePath), 'backups');
    mkdirSync(backupDirectory, { recursive: true });
    const backupPath = path.join(backupDirectory, `gostinaya-before-newsletter-consents-${timestamp()}.db`);
    database.exec(`VACUUM INTO ${sqlString(backupPath)}`);
    console.log(`Backup: ${backupPath}`);
    database.exec(`
      CREATE TABLE IF NOT EXISTS newsletter_consents (
        id TEXT PRIMARY KEY,
        email TEXT NOT NULL,
        language TEXT NOT NULL CHECK(language IN ('ru', 'en')),
        document_version TEXT NOT NULL,
        accepted_at TEXT NOT NULL,
        confirmed_at TEXT,
        revoked_at TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_newsletter_consents_email ON newsletter_consents(email);
    `);
    if (needsRevocation) database.exec('ALTER TABLE newsletter_consents ADD COLUMN revoked_at TEXT');
    if (['newsletter_consents'].some(name => !tableExists(database, name))) {
      throw new Error('Post-migration verification failed.');
    }
    console.log('Migration completed and verified.');
  }
} finally {
  database.close();
}
