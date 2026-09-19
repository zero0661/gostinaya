import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const read = path => fs.readFile(new URL(path, import.meta.url), 'utf8');

test('registration links to localized Lounge rules and data terms', async () => {
  const registration = await read('../views/auth/register.ejs');

  assert.match(registration, /href="\/gostinaya\/rules" target="_blank" rel="noopener"/);
  assert.match(registration, /href="\/gostinaya\/rules\?lang=en" target="_blank" rel="noopener"/);
  assert.match(registration, /href="\/gostinaya\/privacy" target="_blank" rel="noopener"/);
  assert.match(registration, /href="\/gostinaya\/privacy\?lang=en" target="_blank" rel="noopener"/);
  assert.match(registration, /id="acceptsRulesRu"/);
  assert.match(registration, /id="acceptsRulesEn"/);
  assert.match(registration, /id="acceptsPrivacyRu"/);
  assert.match(registration, /id="acceptsPrivacyEn"/);
  assert.match(registration, /acceptsRules,/);
  assert.match(registration, /acceptsPrivacy/);
});

test('legal pages are public routes and keep both localized versions of the actual Lounge terms', async () => {
  const [app, rules, privacy] = await Promise.all([
    read('../app.js'),
    read('../views/legal/rules.ejs'),
    read('../views/legal/privacy.ejs')
  ]);

  assert.match(app, /app\.get\('\/gostinaya\/rules'/);
  assert.match(app, /app\.get\('\/gostinaya\/privacy'/);
  assert.match(rules, /data-lang="ru"/);
  assert.match(rules, /data-lang="en"/);
  assert.match(rules, /Модератор может скрыть отдельное сообщение или тему/);
  assert.match(rules, /Moderators may hide a message or topic/);
  assert.match(rules, /Автор сохраняет права на свой текст/);
  assert.match(privacy, /хеш пароля, хеши временных токенов/);
  assert.match(privacy, /not sold or used for advertising profiles/);
  assert.match(privacy, /резервных копиях до их плановой замены/);
});
