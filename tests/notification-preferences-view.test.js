import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dirname = path.dirname(fileURLToPath(import.meta.url));
const viewPath = path.join(dirname, '..', 'views', 'profile', 'index.ejs');

test('profile separates internal event categories from the master e-mail channel', async () => {
  const source = await fs.readFile(viewPath, 'utf8');

  assert.match(source, /name="notify_replies"/);
  assert.match(source, /name="notify_followed_discussions"/);
  assert.match(source, /name="notify_all_article_discussions"/);
  assert.match(source, /Все новые сообщения во всех обсуждениях статей/);
  assert.match(source, /name="notify_publications"/);
  assert.match(source, /name="notify_new_topics"/);
  assert.match(source, /name="notify_email"/);
  assert.match(source, /Дополнительно дублировать выбранные уведомления на e-mail/);
});
