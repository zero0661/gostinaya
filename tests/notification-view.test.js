import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dirname = path.dirname(fileURLToPath(import.meta.url));
const viewPath = path.join(dirname, '..', 'views', 'notifications', 'index.ejs');

test('notification view exposes localized event, topic, exact-message action and read state', async () => {
  const source = await fs.readFile(viewPath, 'utf8');

  assert.match(source, /item\.read_at \? 'is-read' : 'is-unread'/);
  assert.match(source, /data-lang="ru"/);
  assert.match(source, /data-lang="en"/);
  assert.match(source, /'● Новое'/);
  assert.match(source, /'● New'/);
  assert.match(source, /'✓ Прочитано'/);
  assert.match(source, /'✓ Read'/);
  assert.match(source, /item\.topic_title/);
  assert.match(source, /Перейти к сообщению →/);
  assert.match(source, /Go to message →/);
  assert.match(source, /'Обсуждение статьи'/);
  assert.match(source, /'Article discussion'/);
  assert.match(source, /\/gostinaya\/notifications\/<%= item\.id %>\/open/);
  assert.match(source, /data-notification-time/);
  assert.match(source, /lounge-language-change/);
});
