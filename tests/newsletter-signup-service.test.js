import test from 'node:test';
import assert from 'node:assert/strict';
import { NewsletterSignupService } from '../services/NewsletterSignupServiceCore.js';

function serviceFixture() {
  const sent = [];
  const subscribed = [];
  const unsubscribed = [];
  const tokenRows = new Map();
  const service = new NewsletterSignupService({
    now: () => 1_000_000,
    appUrl: 'https://milenin.pro',
    mailer: async message => { sent.push(message); },
    tokens: {
      async create({ tokenHash, action, payload, expiresAt }) { tokenRows.set(tokenHash, { action, payload, expiresAt }); },
      async findValid(tokenHash, action, now) {
        const row = tokenRows.get(tokenHash);
        return row?.action === action && row.expiresAt > now ? row.payload : null;
      },
      async remove(tokenHash) { tokenRows.delete(tokenHash); }
    },
    ghost: {
      async subscribeMember(value) { subscribed.push(value); return { id: 'member-1' }; },
      async unsubscribeMember(value) { unsubscribed.push(value); }
    }
  });
  return { service, sent, subscribed, unsubscribed };
}

test('confirmation email and Ghost newsletter are localized independently', async () => {
  const { service, sent, subscribed } = serviceFixture();
  await service.issue({ email: ' Reader@Example.com ', language: 'en', returnTo: 'https://milenin.pro/en/article/' });
  assert.equal(sent.length, 1);
  assert.match(sent[0].subject, /Confirm your subscription/);
  assert.doesNotMatch(sent[0].subject, /Подтвердите/);
  const token = new URL(sent[0].text.match(/https:\/\/\S+/)[0]).searchParams.get('token');
  const result = await service.confirm(token);
  assert.equal(result.returnTo, '/en/article/');
  assert.deepEqual(subscribed, [{
    email: 'reader@example.com',
    newsletterName: 'After Login — EN',
    labelName: 'After Login EN'
  }]);
});

test('tokens reject tampering and foreign return URLs', async () => {
  const { service, sent, subscribed } = serviceFixture();
  await service.issue({ email: 'one@example.com', language: 'ru', returnTo: 'https://evil.example/phishing' });
  const token = new URL(sent[0].text.match(/https:\/\/\S+/)[0]).searchParams.get('token');
  assert.equal(await service.confirm(`${token}x`), null);
  assert.equal(subscribed.length, 0);
  const result = await service.confirm(token);
  assert.equal(result.returnTo, '/');
});

test('unsubscribe requires an explicit second step and removes only the selected newsletter', async () => {
  const { service, unsubscribed } = serviceFixture();
  const url = await service.createUnsubscribeUrl({ memberId: 'member-7', email: 'reader@example.com', language: 'ru' });
  const token = new URL(url).searchParams.get('token');
  assert.equal((await service.previewUnsubscribe(token)).action, 'unsubscribe');
  assert.equal(unsubscribed.length, 0, 'opening the GET link must not unsubscribe');
  await service.unsubscribe(token);
  assert.deepEqual(unsubscribed, [{
    memberId: 'member-7',
    email: 'reader@example.com',
    newsletterName: 'После логина — RU'
  }]);
});
