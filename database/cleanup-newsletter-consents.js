import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
const dirname = path.dirname(fileURLToPath(import.meta.url));
const database = new DatabaseSync(process.env.GOSTINAYA_DB_PATH || path.join(dirname, 'gostinaya.db'));
const apply = process.argv.includes('--apply');
const now = Date.now();
const day = 86400000;
try {
 const clauses = [
  ['newsletter_subscription_tokens', 'expires_at <= ?', [now]],
  ['newsletter_consents', 'confirmed_at IS NULL AND revoked_at IS NULL AND accepted_at < ?', [new Date(now - 7 * day).toISOString()]]
 ];
 database.exec('BEGIN IMMEDIATE');
 for (const [table,where,args] of clauses) {
  const count = database.prepare('SELECT COUNT(*) AS count FROM ' + table + ' WHERE ' + where).get(...args).count;
  if(apply) database.prepare('DELETE FROM ' + table + ' WHERE ' + where).run(...args);
  console.log(table + ': ' + count + (apply ? ' deleted' : ' eligible (dry run)'));
 }
 database.exec(apply ? 'COMMIT' : 'ROLLBACK');
} finally { database.close(); }
