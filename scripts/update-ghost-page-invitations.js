#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const APPLY = process.argv.includes('--apply');
const GHOST_URL = 'https://milenin.pro';
const DB_CONTAINER = 'ghost-db-1';
const BACKUP_ROOT = '/root/ghost-theme-backups';
const MARKER = 'after-login-page-invitation';

const TARGETS = new Map([
  ['audiotieka', { lang: 'ru', removeFrom: 'Хотите стать голосом проекта?' }],
  ['karta-proekta', { lang: 'ru', removeFrom: 'Карта ещё не закончена' }],
  ['kontakty', { lang: 'ru' }],
  ['o-proekte', { lang: 'ru', removeFrom: 'Разговор продолжается' }],
  ['ob-avtorie', { lang: 'ru', removeFrom: 'Несколько слов напоследок' }],
  ['en-about-the-author', { lang: 'en' }],
  ['en-about-the-project', { lang: 'en' }],
  ['en-contact', { lang: 'en' }],
  ['en-project-map', { lang: 'en' }]
]);

function fail(message) { throw new Error(message); }

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: options.binary ? null : 'utf8',
    maxBuffer: 128 * 1024 * 1024,
    ...options
  });
  if (result.status !== 0) {
    fail(`${command} failed: ${(result.stderr || result.stdout || '').toString().trim()}`);
  }
  return result.stdout;
}

function mysql(sql) {
  return run('docker', [
    'exec', DB_CONTAINER, 'sh', '-lc',
    'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" "$MYSQL_DATABASE" --raw -N -e "$1"',
    'mysql-command', sql
  ]).trim();
}

function text(node) {
  if (!node || typeof node !== 'object') return '';
  return (typeof node.text === 'string' ? node.text : '') +
    (Array.isArray(node.children) ? node.children.map(text).join('') : '');
}

function normalize(value) {
  return String(value || '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
}

function token(key) {
  const [id, secret] = key.split(':');
  if (!id || !/^[a-f0-9]+$/i.test(secret || '')) fail('Invalid Ghost Admin API key');
  const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  const unsigned = `${encode({ alg: 'HS256', typ: 'JWT', kid: id })}.${encode({ iat: now, exp: now + 300, aud: '/admin/' })}`;
  const signature = crypto.createHmac('sha256', Buffer.from(secret, 'hex')).update(unsigned).digest('base64url');
  return `${unsigned}.${signature}`;
}

async function api(pathname, options = {}) {
  const response = await fetch(`${GHOST_URL}/ghost/api/admin${pathname}`, {
    ...options,
    headers: {
      Authorization: `Ghost ${globalThis.adminToken}`,
      'Accept-Version': 'v5.0',
      'Content-Type': 'application/json'
    }
  });
  const body = await response.text();
  if (!response.ok) fail(`Ghost API ${response.status}: ${body.slice(0, 600)}`);
  return body ? JSON.parse(body) : {};
}

function invitation(lang) {
  const en = lang === 'en';
  const heading = en ? 'The Conversation Continues in the Lounge' : 'Разговор продолжается в Гостиной';
  const copy = en
    ? 'This page ends here, but the conversation doesn’t. In the project Lounge, you can discuss the ideas behind <em>After Login</em>, ask the author a question, share your experience, or suggest a new topic.'
    : 'Эта страница заканчивается здесь, но разговор — нет. В Гостиной проекта можно обсудить идеи «После логина», задать вопрос автору, поделиться опытом или предложить новую тему.';
  const lounge = en ? 'Enter the Lounge' : 'Войти в Гостиную';
  const email = en ? 'Email the Author' : 'Написать автору';
  const motto = en ? 'After Login, everything is just beginning.' : 'После логина всё только начинается.';

  return {
    type: 'html', version: 1,
    html: `<section class="${MARKER}"><h2>${heading}</h2><p>${copy}</p><div class="${MARKER}__actions"><a class="${MARKER}__button ${MARKER}__button--primary" href="https://milenin.pro/gostinaya">${lounge}</a><a class="${MARKER}__button ${MARKER}__button--secondary" href="mailto:pm@milenin.pro">${email}</a></div><p class="${MARKER}__motto"><em>${motto}</em></p><style>.${MARKER}{margin:3.5rem 0 3rem;padding:clamp(1.6rem,4vw,2.6rem);color:#f4f0e8;text-align:center;background:radial-gradient(circle at top left,rgba(169,117,255,.17),transparent 42%),linear-gradient(145deg,#19171f 0%,#111116 100%);border:1px solid rgba(255,255,255,.1);border-radius:22px;box-shadow:0 20px 55px rgba(0,0,0,.22)}.${MARKER} h2{margin:0 0 1rem;color:#fff;font-size:clamp(1.55rem,3vw,2.1rem);line-height:1.25}.${MARKER}>p:not(.${MARKER}__motto){max-width:46rem;margin:0 auto;color:rgba(244,240,232,.76);font-size:1rem;line-height:1.75}.${MARKER}__actions{display:flex;justify-content:center;flex-wrap:wrap;gap:.8rem;margin:1.7rem 0 1.35rem}.${MARKER}__button{display:inline-flex;align-items:center;justify-content:center;min-height:3rem;padding:.78rem 1.3rem;border-radius:999px;font-weight:700;line-height:1.2;text-decoration:none}.${MARKER}__button--primary{color:#161219!important;background:linear-gradient(135deg,#f2d9a7,#c8a5ff);border:1px solid transparent}.${MARKER}__button--secondary{color:#f4f0e8;background:rgba(255,255,255,.045);border:1px solid rgba(255,255,255,.18)}.${MARKER}__motto{margin:0;color:rgba(244,240,232,.58);font-family:Georgia,serif;font-size:.98rem}@media(max-width:600px){.${MARKER}__actions{flex-direction:column}.${MARKER}__button{width:100%}}</style></section>`
  };
}

function plan(page) {
  const target = TARGETS.get(page.slug);
  if (!target) fail(`Unexpected page: ${page.slug}`);
  const document = JSON.parse(page.lexical);
  const nodes = document?.root?.children;
  if (!Array.isArray(nodes)) fail(`Unexpected Lexical document: ${page.slug}`);
  if (nodes.some(node => node.type === 'html' && String(node.html || '').includes(MARKER))) {
    return { page, changed: false, lexical: page.lexical, removed: 0 };
  }

  let removed = 0;
  if (target.removeFrom) {
    const start = nodes.findIndex(node => normalize(text(node)) === target.removeFrom);
    if (start === -1) fail(`Old ending anchor not found: ${page.slug}`);
    removed = nodes.length - start;
    if (removed < 3 || removed > 12) fail(`Unsafe ending boundary: ${page.slug} (${removed} nodes)`);
    nodes.splice(start);
  }

  nodes.push(invitation(target.lang));
  return { page, changed: true, lexical: JSON.stringify(document), removed };
}

async function update(item) {
  return api(`/pages/${item.page.id}/`, {
    method: 'PUT',
    body: JSON.stringify({ pages: [{ id: item.page.id, lexical: item.lexical, updated_at: item.page.updated_at }] })
  });
}

async function main() {
  globalThis.adminToken = token(mysql(`SELECT CONCAT(id, ':', secret) FROM api_keys WHERE type='admin' ORDER BY created_at DESC LIMIT 1`));
  const listing = await api('/pages/?limit=all&formats=lexical&filter=status:published');
  const pages = (listing.pages || []).filter(page => TARGETS.has(page.slug));
  if (pages.length !== TARGETS.size) fail(`Expected ${TARGETS.size} pages, found ${pages.length}`);

  const plans = pages.map(plan);
  for (const item of plans) {
    console.log(`${item.changed ? 'READY' : 'ALREADY'}: ${item.page.slug}${item.removed ? ` (replace ${item.removed} nodes)` : ' (append)'}`);
  }
  const changes = plans.filter(item => item.changed);
  console.log(`Pages: ${pages.length}; changes: ${changes.length}`);
  if (!APPLY) return console.log('Dry run passed. Nothing changed. Run again with --apply.');
  if (!changes.length) return console.log('Nothing to update.');

  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, '');
  const backupDir = path.join(BACKUP_ROOT, `page-invitations-${stamp}`);
  fs.mkdirSync(backupDir, { recursive: true });
  fs.writeFileSync(path.join(backupDir, 'pages.json'), JSON.stringify(changes.map(item => item.page), null, 2));
  const dump = run('docker', ['exec', DB_CONTAINER, 'sh', '-lc', 'mysqldump -uroot -p"$MYSQL_ROOT_PASSWORD" --single-transaction "$MYSQL_DATABASE"'], { binary: true });
  fs.writeFileSync(path.join(backupDir, 'ghost.sql'), dump);

  for (const item of changes) {
    await update(item);
    console.log(`UPDATED: ${item.page.slug}`);
  }
  console.log(`Backup: ${backupDir}`);
  console.log(`Updated pages: ${changes.length}`);
}

main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
