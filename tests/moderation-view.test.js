import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dirname = path.dirname(fileURLToPath(import.meta.url));

test('sidebar exposes moderation only to staff roles', async () => {
  const source = await fs.readFile(path.join(dirname, '..', 'views', 'partials', 'sidebar.ejs'), 'utf8');
  assert.match(source, /\['admin', 'moderator'\]\.includes\(currentGuest\.role\)/);
  assert.match(source, /\/gostinaya\/moderation/);
});

test('discussion messages expose reports and preserve a hidden placeholder', async () => {
  const source = await fs.readFile(path.join(dirname, '..', 'views', 'rooms', 'partials', 'discussion-message.ejs'), 'utf8');
  assert.match(source, /Пожаловаться \/ Report/);
  assert.match(source, /action="\/gostinaya\/reports"/);
  assert.match(source, /message\.hidden_at/);
  assert.match(source, /directReplies\.length/);
});

test('moderation discussion pages use compact Russian controls and honest article metadata', async () => {
  const list = await fs.readFile(path.join(dirname, '..', 'views', 'moderation', 'discussions.ejs'), 'utf8');
  const topic = await fs.readFile(path.join(dirname, '..', 'views', 'moderation', 'discussion.ejs'), 'utf8');
  const css = await fs.readFile(path.join(dirname, '..', 'public', 'gostinaya.css'), 'utf8');

  assert.match(list, /Обсуждение статьи · создано автоматически/);
  assert.match(list, /Тема сообщества · Автор:/);
  assert.doesNotMatch(list, /Редакция \/ Editorial/);
  assert.doesNotMatch(topic, /Topic controls|Pin|Close|Hide/);
  assert.match(css, /\.moderation-button-row button,[\s\S]*?width: auto !important;/);
  assert.match(css, /\.moderation-button-row \{[\s\S]*?grid-template-columns: max-content max-content minmax\(360px, 1fr\)/);
  assert.match(css, /\.moderation-hide-action \{[\s\S]*?grid-template-columns: minmax\(220px, 320px\) max-content/);
  assert.match(css, /\.moderation-button-row form > button\[type="submit"\][\s\S]*?width: auto !important/);
  assert.match(topic, /class="moderation-message-action"/);
  assert.match(css, /\.moderation-message-action \{[\s\S]*?grid-template-columns: minmax\(220px, 320px\) max-content/);
  assert.match(css, /\.moderation-message-action > button\[type="submit"\][\s\S]*?width: auto !important/);
  assert.match(topic, /class="moderation-message-restore"/);
  assert.match(css, /\.moderation-message-restore > button\[type="submit"\][\s\S]*?width: auto !important/);
  assert.match(css, /\.moderation-page \.profile-header h1[\s\S]*?font-size: clamp\(1\.9rem, 3vw, 2\.8rem\)/);
});

test('closed topics explain why replies are unavailable and show Moscow time', async () => {
  const topic = await fs.readFile(path.join(dirname, '..', 'views', 'rooms', 'topic.ejs'), 'utf8');
  const log = await fs.readFile(path.join(dirname, '..', 'views', 'moderation', 'log.ejs'), 'utf8');

  assert.match(topic, /Тема закрыта модератором/);
  assert.match(topic, /New replies are disabled/);
  assert.match(topic, /formatMoscowDateTime\(messages\[0\]\.created_at\)/);
  assert.match(log, /formatMoscowDateTime\(item\.created_at\)/);
});

test('new moderation log details distinguish reasons from topic context', async () => {
  const route = await fs.readFile(path.join(dirname, '..', 'routes', 'moderation.js'), 'utf8');

  assert.match(route, /`Причина: \$\{reason\} · Тема: \$\{topic\.title\}`/);
  assert.match(route, /`Тема: \$\{topic\.title\}`/);
  assert.match(route, /`Причина: \$\{reason\} · Тема №\$\{message\.topic_id\}`/);
});

test('article discussions honor pinning and ignore hidden messages in public counters', async () => {
  const source = await fs.readFile(path.join(dirname, '..', 'repositories', 'ArticleDiscussionRepository.js'), 'utf8');
  assert.match(source, /ORDER BY t\.pinned DESC/);
  assert.match(source, /m\.hidden_at IS NULL/);
});
