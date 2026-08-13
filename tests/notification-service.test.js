import test from 'node:test';
import assert from 'node:assert/strict';
import { NotificationService } from '../services/NotificationServiceCore.js';

function createHarness({ participants = [], recipients = [], directRecipient = null, mailError = null } = {}) {
  const created = [];
  const emails = [];
  const errors = [];
  const service = new NotificationService({
    guests: {
      async listDiscussionParticipants() { return participants; },
      async listNotificationRecipients() { return recipients; },
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
  return { service, created, emails, errors };
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
  ...overrides
});

test('a direct reply overrides the followed-discussion notification without duplication', async () => {
  const actor = guest(3, { name: 'Анна' });
  const harness = createHarness({
    participants: [
      guest(1, { notify_followed_discussions: 1 }),
      guest(2, { notify_replies: 1 }),
      actor
    ]
  });

  await harness.service.notifyMessage({
    topic: { id: 40, title: 'Разговор' },
    messageId: 90,
    body: 'Это новый ответ.',
    actor,
    parentAuthorId: 2
  });

  assert.deepEqual(harness.created.map(item => [item.recipientId, item.type]), [
    [1, 'followed_discussion'],
    [2, 'reply']
  ]);
  assert.equal(harness.emails.length, 2);
  assert.ok(harness.emails.some(item => item.to === 'guest2@example.com' && item.subject.includes('ответил')));
  assert.ok(harness.created.every(item => item.recipientId !== actor.id));
});

test('internal discussion notifications remain enabled when email preferences are off', async () => {
  const harness = createHarness({ participants: [guest(1), guest(2)] });

  await harness.service.notifyMessage({
    topic: { id: 41, title: 'Тема' },
    messageId: 91,
    body: 'Комментарий',
    actor: guest(2)
  });

  assert.equal(harness.created.length, 1);
  assert.equal(harness.created[0].recipientId, 1);
  assert.equal(harness.emails.length, 0);
});

test('new publication notifies everyone internally and emails only subscribers in their language', async () => {
  const harness = createHarness({
    recipients: [
      guest(1, { language: 'ru', notify_publications: 1 }),
      guest(2),
      guest(3, { language: 'en', notify_publications: 1 })
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
  assert.equal(harness.emails.length, 2);
  assert.ok(harness.emails.some(item => item.to === 'guest1@example.com' && item.subject.includes('Русский заголовок')));
  assert.ok(harness.emails.some(item => item.to === 'guest3@example.com' && item.subject.includes('English title') && item.text.includes('/en/english/')));
});

test('new community topic skips its author and respects the email preference', async () => {
  const harness = createHarness({
    recipients: [
      guest(1, { notify_new_topics: 1 }),
      guest(2),
      guest(3, { notify_new_topics: 0 })
    ]
  });

  await harness.service.notifyNewTopic({
    topicId: 60,
    actor: guest(2, { name: 'Пётр' }),
    title: 'Новая тема'
  });

  assert.deepEqual(harness.created.map(item => item.recipientId), [1, 3]);
  assert.equal(harness.emails.length, 1);
  assert.equal(harness.emails[0].to, 'guest1@example.com');
});

test('SMTP failure is logged and does not reject notification delivery', async () => {
  const harness = createHarness({
    participants: [guest(1, { notify_followed_discussions: 1 }), guest(2)],
    mailError: new Error('SMTP unavailable')
  });

  await harness.service.notifyMessage({
    topic: { id: 70, title: 'Тема' },
    messageId: 100,
    body: 'Текст',
    actor: guest(2)
  });
  await new Promise(resolve => setImmediate(resolve));

  assert.equal(harness.created.length, 1);
  assert.equal(harness.errors.length, 1);
});
