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

test('subscription CTA keeps required RU/EN routing and Lounge copy', () => {
  const source = read('scripts/update-ghost-subscription-cta.js');

  assert.match(source, /После логина — RU/);
  assert.match(source, /After Login — EN/);
  assert.match(source, /data-members-newsletter/);
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
