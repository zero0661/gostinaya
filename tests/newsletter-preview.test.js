import test from 'node:test';
import assert from 'node:assert/strict';
import { newsletterPublication } from '../services/NewsletterPublication.js';
import { NewsletterDeliveryService } from '../services/NewsletterDeliveryServiceCore.js';

const post = { id: 'preview', status: 'published', title: 'Preview', url: 'https://milenin.pro/preview/' };
test('article previews prefer author descriptions, decode text and bound fallback length', () => {
  const p = newsletterPublication({ ...post, custom_excerpt: '<b>Авторский</b> &amp; анонс', meta_description: 'SEO', html: '<p>Body</p>', feature_image: 'https://milenin.pro/cover.jpg' });
  assert.equal(p.excerptRu, 'Авторский & анонс');
  assert.equal(p.excerptEn, null);
  assert.equal(p.imageRu, 'https://milenin.pro/cover.jpg');
  const fallback = newsletterPublication({ ...post, html: '<script>danger()</script><p>Hello &quot;reader&quot;</p><p>Next paragraph</p>' });
  assert.equal(fallback.excerptRu, 'Hello "reader" Next paragraph');
  const long = newsletterPublication({ ...post, excerpt: 'A long article '.repeat(80) });
  assert.ok(long.excerptRu.length <= 501);
  assert.ok(long.excerptRu.endsWith('…'));
  const en = newsletterPublication({ ...post, url: 'https://milenin.pro/en/preview/', custom_excerpt: 'English teaser', feature_image: 'javascript:alert(1)' });
  assert.equal(en.excerptEn, 'English teaser');
  assert.equal(en.excerptRu, null);
  assert.equal(en.imageEn, null);
});

test('delivered RU and EN cards contain their own teaser and safely escaped cover/title', async () => {
  const sent = [];
  const service = new NewsletterDeliveryService({
    ghost: { listNewsletterMembers: async () => [{ id: 'one', email: 'reader@example.com' }] },
    deliveries: { claim: async () => true, markSent: async () => {}, markFailed: async () => {} },
    mailer: async message => { sent.push(message); return {}; },
    unsubscribeUrl: async () => 'https://milenin.pro/unsubscribe'
  });
  await service.deliverPublication({ deliveryKey: 'preview', titleRu: '<RU>', titleEn: 'EN',
    urlRu: post.url, urlEn: 'https://milenin.pro/en/preview/',
    excerptRu: 'RU & <teaser>', excerptEn: 'English teaser',
    imageRu: 'https://milenin.pro/cover.jpg', imageEn: 'data:text/html,bad' });
  assert.match(sent[0].text, /RU & <teaser>/);
  assert.match(sent[0].html, /RU &amp; &lt;teaser&gt;/);
  assert.match(sent[0].html, /&lt;RU&gt;/);
  assert.match(sent[0].html, /src="https:\/\/milenin.pro\/cover.jpg"/);
  assert.match(sent[0].html, /Отписаться/);
  assert.match(sent[0].text, /Вы получаете это письмо, потому что подписаны/);
  assert.match(sent[0].html, /Вы получаете это письмо, потому что подписаны/);
  assert.match(sent[1].text, /You are receiving this email because you subscribed/);
  assert.match(sent[1].html, /You are receiving this email because you subscribed/);
  assert.match(sent[1].text, /English teaser/);
  assert.doesNotMatch(sent[1].html, /RU|data:text/);
  const empty = service.publicationEmail({ language: 'ru', title: 'No image', url: post.url });
  assert.doesNotMatch(empty.html, /undefined|null/);
  assert.match(empty.html, /Прочитать статью/);
});
