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
  assert.match(css, /\.moderation-page \.profile-header h1[\s\S]*?font-size: clamp\(1\.9rem, 3vw, 2\.8rem\)/);
});

test('article discussions honor pinning and ignore hidden messages in public counters', async () => {
  const source = await fs.readFile(path.join(dirname, '..', 'repositories', 'ArticleDiscussionRepository.js'), 'utf8');
  assert.match(source, /ORDER BY t\.pinned DESC/);
  assert.match(source, /m\.hidden_at IS NULL/);
});
