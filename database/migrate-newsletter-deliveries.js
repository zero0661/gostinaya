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
  const missing = ['newsletter_deliveries', 'newsletter_subscription_tokens'].filter(name => !tableExists(database, name));
  console.log(`Tables to create: ${missing.length ? missing.join(', ') : 'none'}`);

  if (!apply) {
    console.log('No changes made. Run again with --apply to back up and migrate.');
  } else if (!missing.length) {
    console.log('Migration already applied; no changes made.');
  } else {
    const backupDirectory = path.join(path.dirname(databasePath), 'backups');
    mkdirSync(backupDirectory, { recursive: true });
    const backupPath = path.join(backupDirectory, `gostinaya-before-newsletter-deliveries-${timestamp()}.db`);
    database.exec(`VACUUM INTO ${sqlString(backupPath)}`);
    console.log(`Backup: ${backupPath}`);
    database.exec(`
      CREATE TABLE IF NOT EXISTS newsletter_deliveries (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        delivery_key TEXT NOT NULL,
        newsletter_slug TEXT NOT NULL,
        member_id TEXT NOT NULL,
        recipient_email TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        attempts INTEGER NOT NULL DEFAULT 1,
        message_id TEXT,
        error TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(delivery_key, newsletter_slug, member_id)
      );
      CREATE INDEX IF NOT EXISTS idx_newsletter_deliveries_status
        ON newsletter_deliveries(status, updated_at);
      CREATE TABLE IF NOT EXISTS newsletter_subscription_tokens (
        token_hash TEXT PRIMARY KEY,
        action TEXT NOT NULL,
        payload TEXT NOT NULL,
        expires_at INTEGER NOT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_newsletter_subscription_tokens_expiry
        ON newsletter_subscription_tokens(expires_at);
    `);
    if (['newsletter_deliveries', 'newsletter_subscription_tokens'].some(name => !tableExists(database, name))) {
      throw new Error('Post-migration verification failed.');
    }
    console.log('Migration completed and verified.');
  }
} finally {
  database.close();
}
