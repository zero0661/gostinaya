import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';

const directory = path.dirname(fileURLToPath(import.meta.url));
const databasePath = process.env.GOSTINAYA_DB_PATH || path.join(directory, 'gostinaya.db');
const apply = process.argv.includes('--apply');
const database = new DatabaseSync(databasePath);

try {
  const columns = new Set(database.prepare('PRAGMA table_info(guests)').all().map(row => row.name));
  if (!columns.has('notify_new_topics')) throw new Error('Missing notify_new_topics; apply the profile migration first.');
  console.log(`Mode: ${apply ? 'APPLY' : 'DRY RUN'}`);
  if (columns.has('notify_project_news')) {
    console.log('Migration already applied; no changes made.');
  } else if (!apply) {
    console.log('Will add notify_project_news and copy the existing new-topic preference. No changes made.');
  } else {
    const backupDirectory = path.join(path.dirname(databasePath), 'backups');
    mkdirSync(backupDirectory, { recursive: true });
    const backupPath = path.join(backupDirectory, `gostinaya-before-project-news-preference-${Date.now()}.db`);
    database.exec(`VACUUM INTO '${backupPath.replaceAll("'", "''")}'`);
    console.log(`Backup: ${backupPath}`);
    database.exec('BEGIN IMMEDIATE');
    try {
      database.exec('ALTER TABLE guests ADD COLUMN notify_project_news INTEGER NOT NULL DEFAULT 0');
      database.exec('UPDATE guests SET notify_project_news = CASE WHEN notify_new_topics = 1 THEN 1 ELSE 0 END');
      const mismatches = database.prepare('SELECT COUNT(*) AS total FROM guests WHERE notify_project_news != CASE WHEN notify_new_topics = 1 THEN 1 ELSE 0 END').get();
      if (Number(mismatches.total)) throw new Error('Preference preservation verification failed.');
      database.exec('COMMIT');
    } catch (error) {
      database.exec('ROLLBACK');
      throw error;
    }
    console.log('Migration completed and verified.');
  }
} finally {
  database.close();
}
