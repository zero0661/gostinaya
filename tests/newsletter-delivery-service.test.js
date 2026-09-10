import test from 'node:test';
import assert from 'node:assert/strict';
import { NewsletterDeliveryService } from '../services/NewsletterDeliveryServiceCore.js';

test('publication delivery separates languages and skips duplicate claims', async () => {
  const sent = [];
  const claims = new Set();
  const marked = [];
  const service = new NewsletterDeliveryService({
    ghost: {
      async listNewsletterMembers(name) {
        return name === 'После логина — RU'
          ? [{ id: 'ru-1', email: 'ru@example.com' }]
          : [{ id: 'en-1', email: 'en@example.com' }];
      }
    },
    deliveries: {
      async claim(value) {
        const key = `${value.deliveryKey}:${value.newsletterSlug}:${value.memberId}`;
        if (claims.has(key)) return false;
        claims.add(key);
        return true;
      },
      async markSent(value) { marked.push(value); },
      async markFailed() { throw new Error('unexpected failure'); }
    },
    mailer: async message => { sent.push(message); return { messageId: `m-${sent.length}` }; },
    unsubscribeUrl: ({ language }) => `https://milenin.pro/unsubscribe/${language}`
  });
  const publication = {
    deliveryKey: 'discussion:one',
    titleRu: 'Русская статья', titleEn: 'English article',
    urlRu: 'https://milenin.pro/ru/', urlEn: 'https://milenin.pro/en/one/'
  };
  const first = await service.deliverPublication(publication);
  assert.equal(first.ok, true);
  assert.equal(sent.length, 2);
  assert.match(sent[0].subject, /Русская статья/);
  assert.match(sent[0].text, /unsubscribe\/ru/);
  assert.match(sent[1].subject, /English article/);
  assert.match(sent[1].text, /unsubscribe\/en/);
  assert.equal(marked.length, 2);

  const second = await service.deliverPublication(publication);
  assert.equal(sent.length, 2, 'a repeated webhook must not send duplicate email');
  assert.deepEqual(second.results.map(item => item.skipped), [1, 1]);
});
