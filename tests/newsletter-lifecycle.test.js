import test from 'node:test';
import assert from 'node:assert/strict';
import { NewsletterSignupService } from '../services/NewsletterSignupServiceCore.js';
import { NewsletterDeliveryService } from '../services/NewsletterDeliveryServiceCore.js';
import { newsletterPublication } from '../services/NewsletterPublication.js';
import { legacyMigrationPlan } from '../services/LegacyNewsletterMigration.js';

for (const language of ['ru', 'en']) {
  test(`${language}: confirmation → welcome → publication → unsubscribe → no more mail → resubscribe`, async () => {
    const emails = [], tokens = new Map(), claims = new Set();
    const channels = new Set();
    const names = { ru: 'После логина — RU', en: 'After Login — EN' };
    const member = { id: 'reader', email: 'reader@example.com' };
    const ghost = {
      async isMemberSubscribed({ newsletterName }) { return channels.has(newsletterName); },
      async subscribeMember({ newsletterName }) { channels.add(newsletterName); return member; },
      async unsubscribeMember({ newsletterName }) { channels.delete(newsletterName); return member; },
      async listNewsletterMembers(name) { return channels.has(name) ? [member] : []; }
    };
    const signup = new NewsletterSignupService({ ghost, mailer: async mail => emails.push(mail), tokens: {
      async create(row) { tokens.set(row.tokenHash, row); },
      async findValid(hash, action, now) { const row = tokens.get(hash); return row?.action === action && row.expiresAt > now ? row.payload : null; },
      async remove(hash) { tokens.delete(hash); },
      async consume(hash, action, now) { const row = tokens.get(hash); if (row?.action !== action || row.expiresAt <= now) return null; tokens.delete(hash); return row.payload; }
    } });
    const delivery = new NewsletterDeliveryService({ ghost, mailer: async mail => { emails.push(mail); return { messageId: 'smtp-id' }; },
      unsubscribeUrl: details => signup.createUnsubscribeUrl(details),
      deliveries: {
        async claim(row) { const key = `${row.deliveryKey}:${row.memberId}:${row.newsletterSlug}`; if (claims.has(key)) return false; claims.add(key); return true; },
        async markSent() {}, async markFailed() { assert.fail('unexpected SMTP failure'); }
      }
    });
    await signup.issue({ email: member.email, language });
    assert.equal(channels.size, 0, 'unconfirmed addresses never receive publications');
    const confirmToken = new URL(emails[0].text.match(/https:\/\/\S+/)[0]).searchParams.get('token');
    assert.equal((await signup.confirm(confirmToken)).welcomeSent, true);
    assert.equal(emails.length, 2);
    assert.equal(await signup.confirm(confirmToken), null);
    const post = { id: 'first', status: 'published', title: 'Article', url: `https://milenin.pro/${language === 'en' ? 'en/' : ''}first/`, tags: [{ name: '#discussion-unpaired' }] };
    await delivery.deliverPublication(newsletterPublication(post));
    assert.equal(emails.length, 3);
    assert.ok(emails[2].text.includes(post.url));
    await delivery.deliverPublication(newsletterPublication(post));
    assert.equal(emails.length, 3, 'duplicate publish event is not resent');
    const unsubscribeToken = new URL(emails[2].headers['List-Unsubscribe'].slice(1, -1)).searchParams.get('token');
    await signup.previewUnsubscribe(unsubscribeToken);
    assert.ok(channels.has(names[language]), 'opening link leaves subscription intact');
    assert.equal((await signup.unsubscribe(unsubscribeToken)).receiptSent, true);
    assert.equal(emails.length, 4);
    assert.equal(await signup.unsubscribe(unsubscribeToken), null);
    await delivery.deliverPublication(newsletterPublication({ ...post, id: 'second' }));
    assert.equal(emails.length, 4, 'unsubscribed reader gets no further articles');
    await signup.issue({ email: member.email, language });
    const newToken = new URL(emails[4].text.match(/https:\/\/\S+/)[0]).searchParams.get('token');
    await signup.confirm(newToken);
    await delivery.deliverPublication(newsletterPublication({ ...post, id: 'third' }));
    assert.equal(emails.length, 7);
  });
}

test('publication is independent of pairing and unpublished or foreign posts are excluded', () => {
  const post = { id: 'ru', status: 'published', title: 'RU', url: 'https://milenin.pro/article/', tags: [{ name: '#discussion-pair' }] };
  const publication = newsletterPublication(post);
  assert.equal(publication.deliveryKey, 'post:ru');
  assert.equal(publication.urlEn, null);
  assert.deepEqual(publication.legacyDeliveryKeys, ['discussion:#discussion-pair']);
  assert.equal(newsletterPublication({ ...post, status: 'draft' }), null);
  assert.throws(() => newsletterPublication({ ...post, url: 'https://other.test/article/' }), /Foreign/);
});

test('legacy migration preserves language choices and never revives opted-out readers', () => {
  const newsletters = [{ id: 'old', name: 'После логина' }, { id: 'ru', name: 'После логина — RU' }, { id: 'en', name: 'After Login — EN' }];
  const member = (id, ids, extra = {}) => ({ id, email: `${id}@example.com`, newsletters: ids.map(id => ({ id })), ...extra });
  const plan = legacyMigrationPlan(newsletters, [member('old-only', ['old']), member('ru', ['old', 'ru']), member('en', ['old', 'en']), member('off', ['old'], { subscribed: false }), member('blocked', ['old'], { email_suppression: { suppressed: true } })]);
  assert.deepEqual(plan.migrate.map(row => row.id), ['old-only']);
  assert.deepEqual(plan.review.map(row => row.id), ['en']);
});
