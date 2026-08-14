import test from 'node:test';
import assert from 'node:assert/strict';
import {
  EmailVerificationService,
  hashVerificationToken
} from '../services/EmailVerificationServiceCore.js';

function harness({ consumedGuest = null } = {}) {
  const stored = [];
  const emails = [];
  const consumed = [];
  const cleared = [];
  const service = new EmailVerificationService({
    guests: {
      async saveEmailVerificationToken(id, tokenHash, expiresAt, sentAt, resendBefore) {
        stored.push({ id, tokenHash, expiresAt, sentAt, resendBefore });
        return true;
      },
      async consumeEmailVerificationToken(tokenHash, now) {
        consumed.push({ tokenHash, now });
        return consumedGuest;
      },
      async clearEmailVerificationToken(id, tokenHash) {
        cleared.push({ id, tokenHash });
        return true;
      }
    },
    async mailer(message) { emails.push(message); },
    appUrl: 'https://milenin.pro/',
    ttlMs: 1000,
    resendCooldownMs: 100,
    now: () => 5000
  });
  return { service, stored, emails, consumed, cleared };
}

test('verification stores only a token hash and sends a 24-hour confirmation link', async () => {
  const { service, stored, emails } = harness();
  await service.issue({
    id: 12,
    email: 'member@example.com',
    name: 'Пит Тест',
    language: 'ru'
  }, '/gostinaya/topic/9#message-4');

  assert.equal(stored.length, 1);
  assert.equal(stored[0].id, 12);
  assert.equal(stored[0].tokenHash.length, 64);
  assert.equal(stored[0].expiresAt, 6000);
  assert.equal(stored[0].sentAt, 5000);
  assert.equal(stored[0].resendBefore, 4900);
  assert.equal(emails.length, 1);
  assert.equal(emails[0].to, 'member@example.com');
  assert.match(emails[0].subject, /Подтвердите e-mail/);
  assert.match(emails[0].text, /https:\/\/milenin\.pro\/gostinaya\/verify-email\?token=/);
  assert.doesNotMatch(emails[0].text, new RegExp(stored[0].tokenHash));
  assert.match(emails[0].text, /24 часа/);
});

test('verification hashes a valid token before consuming it', async () => {
  const guest = { id: 12, email: 'member@example.com' };
  const { service, consumed } = harness({ consumedGuest: guest });
  const token = 'a'.repeat(64);

  assert.equal(await service.verify(token), guest);
  assert.deepEqual(consumed, [{ tokenHash: hashVerificationToken(token), now: 5000 }]);
});

test('malformed verification tokens are rejected without a database lookup', async () => {
  const { service, consumed } = harness();
  assert.equal(await service.verify('not-a-token'), null);
  assert.equal(consumed.length, 0);
});

test('a mail failure clears the stored token so registration can be retried', async () => {
  const stored = [];
  const cleared = [];
  const service = new EmailVerificationService({
    guests: {
      async saveEmailVerificationToken(id, tokenHash) {
        stored.push({ id, tokenHash });
        return true;
      },
      async clearEmailVerificationToken(id, tokenHash) {
        cleared.push({ id, tokenHash });
        return true;
      }
    },
    async mailer() { throw new Error('SMTP unavailable'); },
    appUrl: 'https://milenin.pro',
    now: () => 5000
  });

  await assert.rejects(
    service.issue({ id: 12, email: 'member@example.com', name: 'Test', language: 'en' }),
    /SMTP unavailable/
  );
  assert.deepEqual(cleared, stored);
});
