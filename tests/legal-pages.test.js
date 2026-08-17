import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const read = path => fs.readFile(new URL(path, import.meta.url), 'utf8');

test('registration links to the Lounge rules and data terms without losing form state', async () => {
  const registration = await read('../views/auth/register.ejs');

  assert.match(registration, /href="\/gostinaya\/rules" target="_blank" rel="noopener"/);
  assert.match(registration, /href="\/gostinaya\/privacy" target="_blank" rel="noopener"/);
  assert.match(registration, /id="acceptsRules"[^>]+required/);
  assert.match(registration, /id="acceptsPrivacy"[^>]+required/);
});

test('legal pages are public routes and describe actual Lounge data use', async () => {
  const [app, rules, privacy] = await Promise.all([
    read('../app.js'),
    read('../views/legal/rules.ejs'),
    read('../views/legal/privacy.ejs')
  ]);

  assert.match(app, /app\.get\('\/gostinaya\/rules'/);
  assert.match(app, /app\.get\('\/gostinaya\/privacy'/);
  assert.match(rules, /Модератор может скрыть отдельное сообщение или тему/);
  assert.match(rules, /Автор сохраняет права на свой текст/);
  assert.match(privacy, /хеш пароля, хеши временных токенов/);
  assert.match(privacy, /не используются для рекламного профилирования и не продаются/);
  assert.match(privacy, /резервных копиях до их плановой замены/);
});
