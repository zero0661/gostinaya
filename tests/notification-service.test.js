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
  assert.ok(harness.emails[0].text.includes('/en/english/'));
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
  assert.match(harness.emails[0].text, /Прочитать и обсудить/);
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
