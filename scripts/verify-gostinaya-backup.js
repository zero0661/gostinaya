import { verifyDatabaseBackup } from '../services/BackupService.js';

const backupPath = process.argv[2];

if (!backupPath) {
  console.error('Usage: npm run backup:verify -- /absolute/path/to/gostinaya-backup.db');
  process.exitCode = 1;
} else {
  try {
    const report = await verifyDatabaseBackup(backupPath);
    console.log(`Backup checked: ${report.backupPath}`);
    console.log(`SQLite integrity: ${report.integrity}`);
    console.log(`Tables verified: ${report.tables.length}`);
    console.log(`Rows: ${JSON.stringify(report.counts)}`);
    console.log('Restore rehearsal: OK');
  } catch (error) {
    console.error(`Restore rehearsal failed: ${error.message}`);
    process.exitCode = 1;
  }
}
