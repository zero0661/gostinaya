import sqlite3 from 'sqlite3';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dirname = path.dirname(fileURLToPath(import.meta.url));
const db = new sqlite3.Database(path.join(dirname, '..', 'database', 'gostinaya.db'));

function run(sql, params = []) {
  return new Promise((resolve, reject) => db.run(sql, params, error => error ? reject(error) : resolve()));
}

export default {
  async create({ tokenHash, action, payload, expiresAt }) {
    await run('DELETE FROM newsletter_subscription_tokens WHERE expires_at <= ?', [Date.now()]);
    await run(
      `INSERT INTO newsletter_subscription_tokens (token_hash, action, payload, expires_at)
       VALUES (?, ?, ?, ?)`,
      [tokenHash, action, JSON.stringify(payload), expiresAt]
    );
  },
  findValid(tokenHash, action, now) {
    return new Promise((resolve, reject) => db.get(
      `SELECT payload FROM newsletter_subscription_tokens
       WHERE token_hash = ? AND action = ? AND expires_at > ?`,
      [tokenHash, action, now],
      (error, row) => {
        if (error) reject(error);
        else resolve(row ? JSON.parse(row.payload) : null);
      }
    ));
  },
  remove(tokenHash) {
    return run('DELETE FROM newsletter_subscription_tokens WHERE token_hash = ?', [tokenHash]);
  }
};
