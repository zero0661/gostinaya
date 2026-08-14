import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dirname = path.dirname(fileURLToPath(import.meta.url));
const viewPath = path.join(dirname, '..', 'views', 'notifications', 'index.ejs');

test('notification view exposes event, topic, exact-message action and read state', async () => {
  const source = await fs.readFile(viewPath, 'utf8');

  assert.match(source, /item\.read_at \? 'is-read' : 'is-unread'/);
  assert.match(source, /● Новое \/ New/);
  assert.match(source, /✓ Прочитано \/ Read/);
  assert.match(source, /item\.topic_title/);
  assert.match(source, /Перейти к сообщению \/ Go to message/);
  assert.match(source, /\/gostinaya\/notifications\/<%= item\.id %>\/open/);
  assert.match(source, /data-notification-time/);
});
