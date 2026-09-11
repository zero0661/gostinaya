import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

test('subscription CTA uses the bilingual server confirmation flow and keeps Lounge copy', () => {
  const source = read('scripts/update-ghost-subscription-cta.js');

  assert.match(source, /gostinaya\/api\/newsletter\/subscribe/);
  assert.match(source, /name="language" type="hidden" value="ru"/);
  assert.match(source, /name="language" type="hidden" value="en"/);
  assert.doesNotMatch(source, /data-members-form="subscribe"/);
  assert.match(source, /Subscription confirmed\. Thank you\./);
  assert.match(source, /Подписка подтверждена\. Спасибо\./);
  assert.match(source, /You’re already subscribed\./);
  assert.match(source, /Вы уже подписаны\./);
  assert.match(source, /after-login-newsletter-toast/);
  assert.match(source, /Статья заканчивается здесь, но разговор — нет\./);
  assert.match(source, /milen\.petr@gmail\.com/);
  assert.match(source, /gostinaya\/article\/\{\{id\}\}/);
});

test('newsletter setup is dry-run by default and requires explicit apply', () => {
  const source = read('scripts/setup-ghost-newsletters.js');

  assert.match(source, /process\.argv\.includes\('--apply'\)/);
  assert.match(source, /Dry run passed\. Nothing changed/);
  assert.match(source, /subscribe_on_signup: false/);
});

test('contact updater only targets the exact legacy email and creates backups', () => {
  const source = read('scripts/update-ghost-contact-email.js');

  assert.match(source, /OLD_EMAIL = 'pm@milenin\.pro'/);
  assert.match(source, /NEW_EMAIL = 'milen\.petr@gmail\.com'/);
  assert.match(source, /mysqldump/);
  assert.match(source, /Dry run passed\. Nothing changed/);
});

test('newsletter status pages use After Login branding instead of the Lounge layout', () => {
  const app = read('app.js');
  const layout = read('views/layouts/newsletter.ejs');

  assert.match(app, /newsletter\/unsubscribe[\s\S]*?layout: 'layouts\/newsletter'/);
  assert.match(layout, /ПОСЛЕ ЛОГИНА/);
  assert.match(layout, /AFTER LOGIN/);
  assert.doesNotMatch(layout, /Гостиная|The Lounge|lounge-banner/);
});
