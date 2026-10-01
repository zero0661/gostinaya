import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';

test('real SQLite claims serialize failed retries, honor old delivery keys, and consume tokens once', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'newsletter-repositories-'));
  const dbPath = path.join(directory, 'test.db');
  try {
    const db = new DatabaseSync(dbPath);
    db.exec(`CREATE TABLE newsletter_deliveries (
      delivery_key TEXT, newsletter_slug TEXT, member_id TEXT, recipient_email TEXT,
      status TEXT DEFAULT 'pending', attempts INTEGER DEFAULT 1, error TEXT,
      message_id TEXT, updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(delivery_key, newsletter_slug, member_id));
      CREATE TABLE newsletter_subscription_tokens (token_hash TEXT PRIMARY KEY, action TEXT, payload TEXT, expires_at INTEGER);`);
    db.close();
    const code = `
      import assert from 'node:assert/strict';
      import deliveries from './repositories/NewsletterDeliveryRepository.js';
      import tokens from './repositories/NewsletterSubscriptionTokenRepository.js';
      const row = { deliveryKey: 'discussion:#discussion-one', newsletterSlug: 'ru', memberId: 'one', email: 'one@example.com' };
      assert.equal(await deliveries.claim(row), true);
      await deliveries.markSent(row);
      assert.equal(await deliveries.claim({ ...row, deliveryKey: 'post:one', legacyDeliveryKeys: [row.deliveryKey] }), false);
      const failed = { ...row, deliveryKey: 'post:failed' };
      await deliveries.claim(failed);
      await deliveries.markFailed({ ...failed, error: 'SMTP' });
      const results = await Promise.all([deliveries.claim(failed), deliveries.claim(failed)]);
      assert.equal(results.filter(Boolean).length, 1);
      await tokens.create({ tokenHash: 'hash', action: 'confirm', payload: { language: 'ru' }, expiresAt: Date.now()+10000 });
      const consumed = await Promise.all([tokens.consume('hash', 'confirm', Date.now()), tokens.consume('hash', 'confirm', Date.now())]);
      assert.equal(consumed.filter(Boolean).length, 1);
      process.exit(0);
    `;
    const result = spawnSync(process.execPath, ['--input-type=module', '-e', code], {
      encoding: 'utf8', env: { ...process.env, GOSTINAYA_DB_PATH: dbPath }
    });
    assert.equal(result.status, 0, result.stderr);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
