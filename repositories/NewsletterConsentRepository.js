import erasureLedger from '../utils/newsletterErasureLedger.js';
import sqlite3 from 'sqlite3';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dirname = path.dirname(fileURLToPath(import.meta.url));
const db = new sqlite3.Database(process.env.GOSTINAYA_DB_PATH || path.join(dirname, '..', 'database', 'gostinaya.db'));
function run(sql, params) {
  return new Promise((resolve, reject) => db.run(sql, params, error => error ? reject(error) : resolve()));
}
export default {
  canDeliver(email, language) {
    return new Promise((resolve, reject) => db.get(
      'SELECT revoked_at, confirmed_at FROM newsletter_consents WHERE email = ? AND language = ? AND (confirmed_at IS NOT NULL OR revoked_at IS NOT NULL) ORDER BY COALESCE(confirmed_at, accepted_at) DESC, rowid DESC LIMIT 1',
      [String(email).trim().toLowerCase(), language],
      (error, row) => {
        if (error) return reject(error);
        erasureLedger.blocks(email, row?.confirmed_at).then(blocked => resolve(!row?.revoked_at && !blocked), reject);
      }
    ));
  },
  record({ id, email, language, version, acceptedAt }) {
    return run('INSERT INTO newsletter_consents (id, email, language, document_version, accepted_at) VALUES (?, ?, ?, ?, ?)', [id, email, language, version, acceptedAt]);
  },
  markRevoked(email, language, revokedAt) {
    return run('UPDATE newsletter_consents SET revoked_at = COALESCE(revoked_at, ?) WHERE email = ? AND language = ?', [revokedAt, email, language]);
  },
  markConfirmed(id, confirmedAt) {
    return new Promise((resolve, reject) => db.run('UPDATE newsletter_consents SET confirmed_at = COALESCE(confirmed_at, ?) WHERE id = ? AND revoked_at IS NULL', [confirmedAt, id], function(error) {
      if (error) reject(error);
      else if (this.changes !== 1) reject(new Error('CONSENT_RECORD_MISSING'));
      else resolve();
    }));
  }
};
