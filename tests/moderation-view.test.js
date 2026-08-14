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
