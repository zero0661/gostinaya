import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PasswordResetService,
  hashPasswordResetToken
} from '../services/PasswordResetServiceCore.js';

function harness({ guest = null, now = 5000, ttlMs = 1000 } = {}) {
  const stored = [];
  const cleared = [];
  const emails = [];
  const passwordUpdates = [];
  const passwordHashes = [];
  const service = new PasswordResetService({
    guests: {
      async findByEmail() { return guest; },
      async saveResetToken(id, tokenHash, expiresAt) {
        stored.push({ id, tokenHash, expiresAt });
        return true;
      },
      async clearResetToken(id, tokenHash) {
        cleared.push({ id, tokenHash });
        return true;
      },
      async updatePasswordByResetToken(tokenHash, checkedAt, passwordHash) {
        passwordUpdates.push({ tokenHash, checkedAt, passwordHash });
        return true;
      }
    },
    auth: {
      async hashPassword(password) {
        passwordHashes.push(password);
        return `hashed:${password}`;
      }
    },
    async mailer(message) { emails.push(message); },
    appUrl: 'https://milenin.pro/',
    ttlMs,
    now: () => now
  });

  return {
    service,
    stored,
    cleared,
    emails,
    passwordUpdates,
    passwordHashes
  };
}

test('password recovery stores only a token hash and emails the raw one-hour link', async () => {
  const { service, stored, emails } = harness({
    guest: {
      id: 12,
      email: 'member@example.com',
      name: 'Пит Тест',
      language: 'ru'
    }
  });

  const result = await service.request('member@example.com');

  assert.deepEqual(result, { sent: true, expiresAt: 6000 });
  assert.equal(stored.length, 1);
  assert.equal(stored[0].id, 12);
  assert.equal(stored[0].tokenHash.length, 64);
  assert.equal(stored[0].expiresAt, 6000);
  assert.equal(emails.length, 1);
  assert.equal(emails[0].to, 'member@example.com');
  assert.match(emails[0].subject, /Восстановление пароля/);
  const rawToken = emails[0].text.match(
    /https:\/\/milenin\.pro\/gostinaya\/reset-password\?token=([a-f0-9]{64})/
  )?.[1];
  assert.equal(hashPasswordResetToken(rawToken), stored[0].tokenHash);
  assert.doesNotMatch(emails[0].text, new RegExp(stored[0].tokenHash));
  assert.match(emails[0].text, /1 час/);
});

test('an unknown address does not reveal whether an account exists', async () => {
  const { service, stored, emails } = harness();
  assert.deepEqual(await service.request('unknown@example.com'), {
    sent: false,
    expiresAt: null
  });
  assert.equal(stored.length, 0);
  assert.equal(emails.length, 0);
});

test('a mail failure clears the stored password reset token', async () => {
  const stored = [];
  const cleared = [];
  const service = new PasswordResetService({
    guests: {
      async findByEmail() {
        return { id: 12, email: 'member@example.com', name: 'Test', language: 'en' };
      },
      async saveResetToken(id, tokenHash) {
        stored.push({ id, tokenHash });
        return true;
      },
      async clearResetToken(id, tokenHash) {
        cleared.push({ id, tokenHash });
        return true;
      }
    },
    auth: {},
    async mailer() { throw new Error('SMTP unavailable'); },
    appUrl: 'https://milenin.pro',
    now: () => 5000
  });

  await assert.rejects(service.request('member@example.com'), /SMTP unavailable/);
  assert.deepEqual(cleared, stored);
});

test('malformed reset tokens are rejected before password hashing or a database write', async () => {
  const { service, passwordHashes, passwordUpdates } = harness();
  assert.equal(await service.reset('not-a-token', 'new password'), false);
  assert.equal(passwordHashes.length, 0);
  assert.equal(passwordUpdates.length, 0);
});

test('a valid reset token is hashed and consumed in one atomic password update', async () => {
  const { service, passwordUpdates } = harness();
  const token = 'a'.repeat(64);

  assert.equal(await service.reset(token, 'new password'), true);
  assert.deepEqual(passwordUpdates, [{
    tokenHash: hashPasswordResetToken(token),
    checkedAt: 5000,
    passwordHash: 'hashed:new password'
  }]);
});

test('a reset link can be consumed only once and is rejected after expiry', async () => {
  const token = 'b'.repeat(64);
  const expectedHash = hashPasswordResetToken(token);
  let storedHash = expectedHash;
  let currentTime = 5000;
  const expiresAt = 6000;
  const service = new PasswordResetService({
    guests: {
      async updatePasswordByResetToken(tokenHash, checkedAt) {
        if (storedHash !== tokenHash || checkedAt >= expiresAt) return false;
        storedHash = null;
        return true;
      }
    },
    auth: { async hashPassword(password) { return `hashed:${password}`; } },
    mailer: async () => {},
    appUrl: 'https://milenin.pro',
    now: () => currentTime
  });

  assert.equal(await service.reset(token, 'first password'), true);
  assert.equal(await service.reset(token, 'second password'), false);

  storedHash = expectedHash;
  currentTime = expiresAt;
  assert.equal(await service.reset(token, 'third password'), false);
});
