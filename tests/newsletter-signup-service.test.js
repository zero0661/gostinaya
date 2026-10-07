import test from 'node:test';
import { NEWSLETTER_CONSENT_VERSION } from '../utils/newsletterConsent.js';
import assert from 'node:assert/strict';
import { NewsletterSignupService } from '../services/NewsletterSignupServiceCore.js';

function serviceFixture() {
  const sent = [];
  const subscribed = [];
  const unsubscribed = [];
  const tokenRows = new Map();
  const service = new NewsletterSignupService({ consents: { async record() {}, async markConfirmed() {} },
    now: () => 1_000_000,
    appUrl: 'https://milenin.pro',
    mailer: async message => { sent.push(message); },
    tokens: {
      async create({ tokenHash, action, payload, expiresAt }) { tokenRows.set(tokenHash, { action, payload, expiresAt }); },
      async findValid(tokenHash, action, now) {
        const row = tokenRows.get(tokenHash);
        return row?.action === action && row.expiresAt > now ? row.payload : null;
      },
      async remove(tokenHash) { tokenRows.delete(tokenHash); },
      async consume(tokenHash, action, now) {
        const row = tokenRows.get(tokenHash);
        if (row?.action !== action || row.expiresAt <= now) return null;
        tokenRows.delete(tokenHash);
        return row.payload;
      }
    },
    ghost: {
      async isMemberSubscribed() { return false; },
      async subscribeMember(value) { subscribed.push(value); return { id: 'member-1' }; },
      async unsubscribeMember(value) { unsubscribed.push(value); return { id: value.memberId }; }
    }
  });
  return { service, sent, subscribed, unsubscribed };
}

test('confirmation email and Ghost newsletter are localized independently', async () => {
  const { service, sent, subscribed } = serviceFixture();
  await service.issue({ consent: true, consentVersion: NEWSLETTER_CONSENT_VERSION, email: ' Reader@Example.com ', language: 'en', returnTo: 'https://milenin.pro/en/article/' });
  assert.equal(sent.length, 1);
  assert.match(sent[0].subject, /Confirm your subscription/);
  assert.doesNotMatch(sent[0].subject, /Подтвердите/);
  assert.match(sent[0].html, /cid:after-login-logo/);
  assert.equal(sent[0].attachments[0].cid, 'after-login-logo');
  const token = new URL(sent[0].text.match(/https:\/\/\S+/)[0]).searchParams.get('token');
  const result = await service.confirm(token);
  assert.equal(result.returnTo, '/en/article/');
  assert.deepEqual(subscribed, [{
    email: 'reader@example.com',
    newsletterName: 'After Login — EN',
    labelName: 'After Login EN'
  }]);
  assert.equal(sent.length, 2);
  assert.equal(sent[1].subject, 'Welcome to After Login');
  assert.match(sent[1].text, /Join the Lounge: https:\/\/milenin\.pro\/gostinaya\/register/);
  assert.match(sent[1].text, /Unsubscribe: https:\/\/milenin\.pro\/gostinaya\/newsletter\/unsubscribe\?token=/);
  assert.match(sent[1].html, /cid:after-login-logo/);
  assert.match(sent[1].html, /background:#6941c6/);
  assert.match(sent[1].headers['List-Unsubscribe'], /^<https:\/\/milenin\.pro\/gostinaya\/newsletter\/unsubscribe\?token=.*>$/);
  assert.equal(sent[1].attachments[0].cid, 'after-login-logo');
  assert.equal(await service.confirm(token), null, 'the confirmation link must not send a second welcome email');
  assert.equal(sent.length, 2);
});

test('Russian subscribers receive one localized welcome email after confirmation', async () => {
  const { service, sent } = serviceFixture();
  await service.issue({ consent: true, consentVersion: NEWSLETTER_CONSENT_VERSION, email: 'reader@example.com', language: 'ru', returnTo: 'https://milenin.pro/article/' });
  const token = new URL(sent[0].text.match(/https:\/\/\S+/)[0]).searchParams.get('token');
  await service.confirm(token);
  assert.equal(sent.length, 2);
  assert.equal(sent[1].subject, 'Добро пожаловать в «После логина»');
  assert.match(sent[1].text, /проекта «После логина»!/);
  assert.doesNotMatch(sent[1].text, /«После логина»\.\./);
  assert.match(sent[1].text, /Зарегистрироваться в Гостиной: https:\/\/milenin\.pro\/gostinaya\/register/);
  assert.match(sent[1].text, /Отписаться: https:\/\/milenin\.pro\/gostinaya\/newsletter\/unsubscribe\?token=/);
});

test('confirmed subscribers are recognized without sending another email', async () => {
  const { service, sent } = serviceFixture();
  service.ghost.isMemberSubscribed = async ({ email, newsletterName }) => {
    assert.equal(email, 'reader@example.com');
    assert.equal(newsletterName, 'После логина — RU');
    return true;
  };
  const result = await service.issue({ consent: true, consentVersion: NEWSLETTER_CONSENT_VERSION,
    email: 'Reader@Example.com',
    language: 'ru',
    returnTo: 'https://milenin.pro/article/'
  });
  assert.deepEqual(result, { language: 'ru', status: 'already-subscribed' });
  assert.equal(sent.length, 0);
});

test('tokens reject tampering and foreign return URLs', async () => {
  const { service, sent, subscribed } = serviceFixture();
  await service.issue({ consent: true, consentVersion: NEWSLETTER_CONSENT_VERSION, email: 'one@example.com', language: 'ru', returnTo: 'https://evil.example/phishing' });
  const token = new URL(sent[0].text.match(/https:\/\/\S+/)[0]).searchParams.get('token');
  assert.equal(await service.confirm(`${token}x`), null);
  assert.equal(subscribed.length, 0);
  const result = await service.confirm(token);
  assert.equal(result.returnTo, '/');
});

test('unsubscribe requires an explicit second step and removes only the selected newsletter', async () => {
  const { service, unsubscribed, sent } = serviceFixture();
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
  assert.equal(sent.length, 1);
  assert.match(sent[0].subject, /Отписка подтверждена/);
  assert.equal(await service.unsubscribe(token), null);
  assert.equal(sent.length, 1);
});

test('receipt failure does not restore subscription or make opt-out fail', async () => {
  const { service, unsubscribed } = serviceFixture();
  service.logger = { error() {} };
  service.mailer = async () => { throw new Error('SMTP unavailable'); };
  const token = new URL(await service.createUnsubscribeUrl({ memberId: 'member-7', email: 'reader@example.com', language: 'en' })).searchParams.get('token');
  const result = await service.unsubscribe(token);
  assert.equal(result.receiptSent, false);
  assert.equal(unsubscribed.length, 1);
  assert.equal(await service.unsubscribe(token), null);
});

test('missing Ghost member must not produce a false successful unsubscribe', async () => {
  const { service, sent } = serviceFixture();
  service.ghost.unsubscribeMember = async () => null;
  const token = new URL(await service.createUnsubscribeUrl({ memberId: 'missing', email: 'reader@example.com', language: 'ru' })).searchParams.get('token');
  await assert.rejects(service.unsubscribe(token), /did not confirm/);
  assert.equal(sent.length, 0);
  assert.ok(await service.previewUnsubscribe(token));
});

test('welcome failure does not undo a confirmed subscription or reuse its token', async () => {
  const { service, sent, subscribed } = serviceFixture();
  await service.issue({ consent: true, consentVersion: NEWSLETTER_CONSENT_VERSION, email: 'reader@example.com', language: 'ru' });
  const token = new URL(sent[0].text.match(/https:\/\/\S+/)[0]).searchParams.get('token');
  service.logger = { error() {} };
  service.mailer = async () => { throw new Error('SMTP unavailable'); };
  assert.equal((await service.confirm(token)).welcomeSent, false);
  assert.equal(subscribed.length, 1);
  assert.equal(await service.confirm(token), null);
});

test('concurrent confirmation and unsubscribe send only one welcome and one receipt', async () => {
  const { service, sent, subscribed, unsubscribed } = serviceFixture();
  await service.issue({ consent: true, consentVersion: NEWSLETTER_CONSENT_VERSION, email: 'reader@example.com', language: 'ru' });
  const token = new URL(sent[0].text.match(/https:\/\/\S+/)[0]).searchParams.get('token');
  const results = await Promise.all([service.confirm(token), service.confirm(token)]);
  assert.equal(results.filter(Boolean).length, 1);
  assert.equal(subscribed.length, 1);
  assert.equal(sent.length, 2);
  const optOut = new URL(sent[1].headers['List-Unsubscribe'].slice(1, -1)).searchParams.get('token');
  await Promise.all([service.unsubscribe(optOut), service.unsubscribe(optOut)]);
  assert.equal(unsubscribed.length, 1);
  assert.equal(sent.length, 3);
});

test('expired confirmation cannot subscribe or send a welcome', async () => {
  const { service, sent, subscribed } = serviceFixture();
  await service.issue({ consent: true, consentVersion: NEWSLETTER_CONSENT_VERSION, email: 'reader@example.com', language: 'ru' });
  const token = new URL(sent[0].text.match(/https:\/\/\S+/)[0]).searchParams.get('token');
  service.now = () => 1_000_000 + service.ttlMs;
  assert.equal(await service.confirm(token), null);
  assert.equal(subscribed.length, 0);
  assert.equal(sent.length, 1);
});
