import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';

const dirname = path.dirname(fileURLToPath(import.meta.url));
const databasePath = process.env.GOSTINAYA_DB_PATH || path.join(dirname, '..', 'database', 'gostinaya.db');
const apply = process.argv.includes('--apply');
const emailIndex = process.argv.indexOf('--email');
const roleIndex = process.argv.indexOf('--role');
const email = emailIndex >= 0 ? String(process.argv[emailIndex + 1] || '').trim().toLowerCase() : '';
const role = roleIndex >= 0 ? String(process.argv[roleIndex + 1] || '').trim().toLowerCase() : '';
const allowedRoles = new Set(['guest', 'author', 'moderator', 'admin']);

function sqlString(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

if (!email || !allowedRoles.has(role)) {
  throw new Error('Use --email address@example.com --role guest|author|moderator|admin [--apply]');
}

const database = new DatabaseSync(databasePath);
try {
  const guest = database.prepare(`
    SELECT id, email, name, role, email_verified_at
    FROM guests
    WHERE LOWER(email) = LOWER(?)
  `).get(email);
  if (!guest) throw new Error('Account not found.');
  if (!guest.email_verified_at) throw new Error('Account e-mail is not verified.');

  console.log(`Mode: ${apply ? 'APPLY' : 'DRY RUN'}`);
  console.log(`Account: #${guest.id} ${guest.email} (${guest.name})`);
  console.log(`Role: ${guest.role} -> ${role}`);

  if (!apply) {
    console.log('No changes made. Run again with --apply.');
  } else if (guest.role === role) {
    console.log('Role already assigned; no changes made.');
  } else {
    const backupDirectory = path.join(path.dirname(databasePath), 'backups');
    mkdirSync(backupDirectory, { recursive: true });
    const stamp = new Date().toISOString().replace(/[-:T]/g, '').replace(/\..+/, '');
    const backupPath = path.join(backupDirectory, `gostinaya-before-role-change-${stamp}.db`);
    database.exec(`VACUUM INTO ${sqlString(backupPath)}`);
    database.prepare('UPDATE guests SET role = ? WHERE id = ?').run(role, guest.id);
    const updated = database.prepare('SELECT role FROM guests WHERE id = ?').get(guest.id);
    if (updated?.role !== role) throw new Error('Role update verification failed.');
    console.log(`Backup: ${backupPath}`);
    console.log('Role updated and verified. Reload any Lounge page to refresh the session.');
  }
} finally {
  database.close();
}
