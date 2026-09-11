import sqlite3 from 'sqlite3';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dirname = path.dirname(fileURLToPath(import.meta.url));
const db = new sqlite3.Database(path.join(dirname, '..', 'database', 'gostinaya.db'));

function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (error) {
      if (error) reject(error);
      else resolve(this);
    });
  });
}

function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (error, row) => error ? reject(error) : resolve(row));
  });
}

export default {
  async claim({ deliveryKey, newsletterSlug, memberId, email }) {
    const existing = await get(
      'SELECT status FROM newsletter_deliveries WHERE delivery_key = ? AND newsletter_slug = ? AND member_id = ?',
      [deliveryKey, newsletterSlug, memberId]
    );
    if (existing?.status === 'sent' || existing?.status === 'pending') return false;
    if (existing) {
      await run(
        `UPDATE newsletter_deliveries
         SET status = 'pending', attempts = attempts + 1, error = NULL, updated_at = CURRENT_TIMESTAMP
         WHERE delivery_key = ? AND newsletter_slug = ? AND member_id = ?`,
        [deliveryKey, newsletterSlug, memberId]
      );
      return true;
    }
    const result = await run(
      `INSERT OR IGNORE INTO newsletter_deliveries
       (delivery_key, newsletter_slug, member_id, recipient_email)
       VALUES (?, ?, ?, ?)`,
      [deliveryKey, newsletterSlug, memberId, email]
    );
    return result.changes === 1;
  },

  markSent({ deliveryKey, newsletterSlug, memberId, messageId }) {
    return run(
      `UPDATE newsletter_deliveries
       SET status = 'sent', message_id = ?, error = NULL, updated_at = CURRENT_TIMESTAMP
       WHERE delivery_key = ? AND newsletter_slug = ? AND member_id = ?`,
      [messageId || null, deliveryKey, newsletterSlug, memberId]
    );
  },

  markFailed({ deliveryKey, newsletterSlug, memberId, error }) {
    return run(
      `UPDATE newsletter_deliveries
       SET status = 'failed', error = ?, updated_at = CURRENT_TIMESTAMP
       WHERE delivery_key = ? AND newsletter_slug = ? AND member_id = ?`,
      [String(error || '').slice(0, 1000), deliveryKey, newsletterSlug, memberId]
    );
  }
};
