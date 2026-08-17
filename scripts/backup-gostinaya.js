import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createVerifiedDatabaseBackup } from '../services/BackupService.js';

const dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.join(dirname, '..');
const sourcePath = process.env.GOSTINAYA_DB_PATH || path.join(projectRoot, 'database', 'gostinaya.db');
const outputDirectory = process.env.GOSTINAYA_BACKUP_DIR || path.join(projectRoot, 'database', 'backups');

try {
  const report = await createVerifiedDatabaseBackup({ sourcePath, outputDirectory });
  console.log(`Backup created: ${report.backupPath}`);
  console.log(`SQLite integrity: ${report.integrity}`);
  console.log(`Tables verified: ${report.tables.length}`);
  console.log(`Rows: ${JSON.stringify(report.counts)}`);
  console.log('Restore rehearsal: OK');
} catch (error) {
  console.error(`Backup failed: ${error.message}`);
  process.exitCode = 1;
}
