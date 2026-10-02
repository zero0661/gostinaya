import test from 'node:test';
import assert from 'node:assert/strict';
import { NotificationService } from '../services/NotificationServiceCore.js';

function createHarness({ participants = [], recipients = [], directRecipient = null, mailError = null } = {}) {
  const created = [];
  const emails = [];
  const errors = [];
  const calls = { participants: 0, recipients: 0 };
  const service = new NotificationService({
    guests: {
      async listDiscussionParticipants() {
        calls.participants += 1;
        return participants;
      },
      async listNotificationRecipients() {
        calls.recipients += 1;
        return recipients;
      },
      async findById() { return directRecipient; }
    },
    notifications: {
      async create(notification) { created.push(notification); }
    },
    async mailer(message) {
      emails.push(message);
      if (mailError) throw mailError;
    },
    logger: {
      error(...args) { errors.push(args); }
    }
  });
  return { service, created, emails, errors, calls };
}

const guest = (id, overrides = {}) => ({
  id,
  email: `guest${id}@example.com`,
  name: `Guest ${id}`,
  language: 'ru',
  notify_replies: 0,
  notify_followed_discussions: 0,
  notify_publications: 0,
  notify_new_topics: 0,
  notify_all_article_discussions: 0,
  notify_email: 0,
  ...overrides
});

test('direct reply has priority and creates at most one internal notification and one e-mail', async () => {
  const actor = guest(3, { name: 'Анна' });
  const harness = createHarness({
    participants: [
      guest(1, { notify_followed_discussions: 1, notify_email: 1 }),
      guest(2, {
        notify_replies: 1,
        notify_followed_discussions: 1,
        notify_all_article_discussions: 1,
        notify_email: 1
      }),
      actor
    ],
    recipients: [guest(2, {
      notify_replies: 1,
      notify_followed_discussions: 1,
      notify_all_article_discussions: 1,
      notify_email: 1
    })]
  });

  await harness.service.notifyMessage({
    topic: { id: 40, title: 'Разговор', room: 'articles' },
    messageId: 90,
    body: 'Это новый ответ.',
    actor,
    parentAuthorId: 2
  });

  assert.deepEqual(harness.created.map(item => [item.recipientId, item.type]), [
    [1, 'followed_discussion'],
    [2, 'reply']
  ]);
  assert.deepEqual(harness.emails.map(item => item.to).sort(), [
    'guest1@example.com',
    'guest2@example.com'
  ]);
  assert.ok(harness.emails.find(item => item.to === 'guest2@example.com').subject.includes('ответил'));
  assert.ok(harness.created.every(item => item.recipientId !== actor.id));
});

test('master e-mail preference off keeps the selected internal notification only', async () => {
  const harness = createHarness({
    participants: [
      guest(1, { notify_followed_discussions: 1, notify_email: 0 }),
      guest(2)
    ]
  });

  await harness.service.notifyMessage({
    topic: { id: 41, title: 'Тема', room: 'community' },
    messageId: 91,
    body: 'Комментарий',
    actor: guest(2)
  });

  assert.deepEqual(harness.created.map(item => item.recipientId), [1]);
  assert.equal(harness.emails.length, 0);
});

test('disabled event category creates neither an internal notification nor e-mail', async () => {
  const harness = createHarness({
    participants: [guest(1, { notify_email: 1 }), guest(2)]
  });

  await harness.service.notifyMessage({
    topic: { id: 42, title: 'Тема', room: 'community' },
    messageId: 92,
    body: 'Комментарий',
    actor: guest(2)
  });

  assert.equal(harness.created.length, 0);
  assert.equal(harness.emails.length, 0);
});

test('all-article subscription reaches a non-participant and does not duplicate a participant', async () => {
  const participant = guest(1, {
    notify_followed_discussions: 1,
    notify_all_article_discussions: 1
  });
  const globalSubscriber = guest(4, {
    notify_all_article_discussions: 1,
    notify_email: 1
  });
  const harness = createHarness({
    participants: [participant, guest(2)],
    recipients: [participant, globalSubscriber]
  });

  await harness.service.notifyMessage({
    topic: { id: 43, title: 'Статья', room: 'articles' },
    messageId: 93,
    body: 'Комментарий к статье',
    actor: guest(2)
  });

  assert.deepEqual(harness.created.map(item => [item.recipientId, item.type]), [
    [1, 'followed_discussion'],
    [4, 'article_discussion']
  ]);
  assert.deepEqual(harness.emails.map(item => item.to), ['guest4@example.com']);
});

test('all-article subscription does not apply to community topics', async () => {
  const harness = createHarness({
    participants: [guest(2)],
    recipients: [guest(4, { notify_all_article_discussions: 1, notify_email: 1 })]
  });

  await harness.service.notifyMessage({
    topic: { id: 44, title: 'Тема сообщества', room: 'community' },
    messageId: 94,
    body: 'Сообщение',
    actor: guest(2)
  });

  assert.equal(harness.calls.recipients, 0);
  assert.equal(harness.created.length, 0);
  assert.equal(harness.emails.length, 0);
});

test('publication category controls the internal notification and master preference controls e-mail', async () => {
  const harness = createHarness({
    recipients: [
      guest(1, { language: 'ru', notify_publications: 1, notify_email: 0 }),
      guest(2, { notify_publications: 1, notify_email: 1 }),
      guest(3, { language: 'en', notify_publications: 1, notify_email: 1 }),
      guest(4, { notify_publications: 0, notify_email: 1 })
    ]
  });

  await harness.service.notifyPublication({
    topicId: 50,
    actorId: 2,
    title: 'Русский заголовок',
    titleRu: 'Русский заголовок',
    titleEn: 'English title',
    urlRu: 'https://milenin.pro/russian/',
    urlEn: 'https://milenin.pro/en/english/'
  });

  assert.deepEqual(harness.created.map(item => item.recipientId), [1, 3]);
  assert.deepEqual(harness.emails.map(item => item.to), ['guest3@example.com']);
  assert.ok(harness.emails[0].subject.includes('English title'));
  assert.ok(harness.emails[0].text.includes('/gostinaya/topic/50'));
  assert.ok(!harness.emails[0].text.includes('/en/english/'));
});

test('new-topic category controls the internal notification and master preference controls e-mail', async () => {
  const harness = createHarness({
    recipients: [
      guest(1, { notify_new_topics: 1, notify_email: 1 }),
      guest(2, { notify_new_topics: 1, notify_email: 1 }),
      guest(3, { notify_new_topics: 1, notify_email: 0 }),
      guest(4, { notify_new_topics: 0, notify_email: 1 })
    ]
  });

  await harness.service.notifyNewTopic({
    topicId: 60,
    actor: guest(2, { name: 'Пётр' }),
    title: 'Новая тема'
  });

  assert.deepEqual(harness.created.map(item => item.recipientId), [1, 3]);
  assert.deepEqual(harness.emails.map(item => item.to), ['guest1@example.com']);
});

test('project news uses the topic preference but has its own notification identity and wording', async () => {
  const harness = createHarness({
    recipients: [
      guest(1, { notify_new_topics: 1, notify_email: 1 }),
      guest(2, { notify_new_topics: 1, notify_email: 1 })
    ]
  });

  await harness.service.notifyNewTopic({
    topicId: 61,
    actor: guest(2, { name: 'Пётр' }),
    title: 'Аудиоверсия статьи «После титров»',
    room: 'news'
  });

  assert.deepEqual(harness.created.map(item => [item.recipientId, item.type]), [
    [1, 'project_news']
  ]);
  assert.match(harness.created[0].text, /новость проекта/);
  assert.deepEqual(harness.emails.map(item => item.to), ['guest1@example.com']);
  assert.match(harness.emails[0].subject, /Новость проекта/);
  assert.match(harness.emails[0].text, /Посмотреть на сайте и обсудить/);
});

test('news emails contain full matching RU/EN text, safe paragraphs and the discussion link', async () => {
  const harness = createHarness({ recipients: [
    guest(5, { language: 'ru', notify_new_topics: 1, notify_email: 1 }),
    guest(6, { language: 'en', notify_new_topics: 1, notify_email: 1 })
  ] });
  const bodyRu = `Первая строка\nВторая строка\n\n${'Полный текст '.repeat(300)}Конец RU <script>alert(1)</script>`;
  const bodyEn = 'First paragraph\n\nFinal EN paragraph & details';
  await harness.service.notifyNewTopic({
    topicId: 61, actor: guest(2), room: 'news', title: 'Новость', body: bodyRu,
    titleRu: 'Новость RU', titleEn: 'News EN', bodyRu, bodyEn
  });
  const [ru, en] = harness.emails;
  assert.match(ru.subject, /Новость RU/);
  assert.match(en.subject, /News EN/);
  assert.ok(ru.text.includes(bodyRu));
  assert.ok(en.text.includes(bodyEn));
  assert.ok(!en.text.includes('Конец RU'));
  assert.match(ru.html, /Первая строка<br>Вторая строка/);
  assert.match(ru.html, /Конец RU &lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.doesNotMatch(ru.html, /<script>/);
  assert.match(en.html, /Final EN paragraph &amp; details/);
  for (const mail of [ru, en]) {
    assert.match(mail.html, /href="[^"]*\/gostinaya\/topic\/61"/);
    assert.match(mail.text, /\/gostinaya\/topic\/61/);
    assert.match(mail.html, /gostinaya\/profile/);
    assert.equal(mail.attachments.length, 1);
    assert.equal(mail.headers, undefined);
  }
});

test('community topic emails include the entire opening message in its original language', async () => {
  const harness = createHarness({ recipients: [
    guest(5, { language: 'en', notify_new_topics: 1, notify_email: 1 })
  ] });
  const body = `${'Текст автора '.repeat(350)}Последняя строка`;
  await harness.service.notifyNewTopic({
    topicId: 62, actor: guest(2), room: 'community', title: 'Тема автора', body
  });
  assert.ok(harness.emails[0].text.includes(body));
  assert.match(harness.emails[0].html, /Последняя строка/);
  assert.match(harness.emails[0].text, /View on the website and discuss/);
  assert.match(harness.emails[0].text, /\/gostinaya\/topic\/62/);
});

test('SMTP failure is logged and does not reject internal notification delivery', async () => {
  const harness = createHarness({
    participants: [
      guest(1, { notify_followed_discussions: 1, notify_email: 1 }),
      guest(2)
    ],
    mailError: new Error('SMTP unavailable')
  });

  await harness.service.notifyMessage({
    topic: { id: 70, title: 'Тема', room: 'community' },
    messageId: 100,
    body: 'Текст',
    actor: guest(2)
  });
  await new Promise(resolve => setImmediate(resolve));

  assert.equal(harness.created.length, 1);
  assert.equal(harness.errors.length, 1);
});


test('Lounge article cards use localized previews, branding and profile settings', async () => {
  const harness = createHarness({ recipients: [
    guest(5, { language: 'ru', notify_publications: 1, notify_email: 1 }),
    guest(6, { language: 'en', notify_publications: 1, notify_email: 1 })
  ] });
  await harness.service.notifyPublication({
    topicId: 70, actorId: 2, title: 'Статья', titleRu: 'Статья', titleEn: 'Article',
    urlRu: 'https://milenin.pro/article/', urlEn: 'https://milenin.pro/en/article/',
    excerptRu: 'Русский анонс <script>', excerptEn: 'English preview',
    imageRu: 'https://milenin.pro/ru.png', imageEn: 'https://milenin.pro/en.png'
  });
  const [ru, en] = harness.emails;
  for (const mail of [ru, en]) {
    assert.match(mail.html, /href="[^"]*\/gostinaya\/topic\/70\?lang=(ru|en)"/);
    assert.match(mail.text, /\/gostinaya\/topic\/70/);
    assert.doesNotMatch(mail.html, /href="https:\/\/milenin\.pro\/(en\/)?article\/"/);
  }
  assert.match(ru.html, /\/gostinaya\/topic\/70\?lang=ru/);
  assert.match(en.html, /\/gostinaya\/topic\/70\?lang=en/);
  assert.match(ru.text, /\/gostinaya\/topic\/70\?lang=ru/);
  assert.match(en.text, /\/gostinaya\/topic\/70\?lang=en/);
  assert.match(ru.html, /Русский анонс &lt;script&gt;/);
  assert.match(ru.html, /ru\.png/);
  assert.doesNotMatch(ru.html, /en\.png/);
  assert.match(en.html, /English preview/);
  assert.match(en.html, /en\.png/);
  assert.match(ru.text, /включили уведомления/);
  assert.match(en.text, /enabled new article notifications/);
  assert.match(ru.html, /Настройки уведомлений/);
  assert.match(en.html, /Notification settings/);
  assert.match(en.html, /gostinaya\/profile/);
  assert.equal(en.attachments.length, 1);
  assert.equal(en.headers, undefined);
});
