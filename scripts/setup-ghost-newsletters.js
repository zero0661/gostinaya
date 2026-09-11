#!/usr/bin/env node
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';

const APPLY = process.argv.includes('--apply');
const GHOST_URL = 'https://milenin.pro';
const DB_CONTAINER = 'ghost-db-1';

const REQUIRED = [
  {
    name: 'После логина — RU',
    description: 'Новые русскоязычные публикации проекта «После логина».',
    status: 'active',
    subscribe_on_signup: false,
    sender_reply_to: 'newsletter'
  },
  {
    name: 'After Login — EN',
    description: 'New English-language publications from After Login.',
    status: 'active',
    subscribe_on_signup: false,
    sender_reply_to: 'newsletter'
  }
];

function fail(message) {
  throw new Error(message);
}

function run(command, args) {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    maxBuffer: 128 * 1024 * 1024
  });

  if (result.status !== 0) {
    fail(`${command} failed: ${(result.stderr || result.stdout || '').trim()}`);
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

function createToken(key) {
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
      'Accept-Version': 'v6.0',
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });

  const body = await response.text();
  if (!response.ok) fail(`Ghost API ${response.status}: ${body.slice(0, 800)}`);
  return body ? JSON.parse(body) : {};
}

async function main() {
  const key = mysql(`
    SELECT CONCAT(id, ':', secret)
    FROM api_keys
    WHERE type = 'admin'
    ORDER BY created_at DESC
    LIMIT 1
  `);
  globalThis.adminToken = createToken(key);

  const listing = await api('/newsletters/?limit=all');
  const newsletters = listing.newsletters || [];
  const existingNames = new Set(newsletters.map(item => item.name));
  const missing = REQUIRED.filter(item => !existingNames.has(item.name));

  console.log(`Existing newsletters: ${newsletters.length}`);
  for (const newsletter of newsletters) {
    console.log(`EXISTS: ${newsletter.name} [${newsletter.status}]`);
  }
  for (const newsletter of missing) {
    console.log(`CREATE: ${newsletter.name}`);
  }

  if (!missing.length) {
    console.log('Both project newsletters already exist. Nothing to change.');
    return;
  }

  if (!APPLY) {
    console.log('Dry run passed. Nothing changed. Run again with --apply.');
    return;
  }

  for (const newsletter of missing) {
    const response = await api('/newsletters/', {
      method: 'POST',
      body: JSON.stringify({ newsletters: [newsletter] })
    });
    const created = response.newsletters?.[0];
    if (!created || created.name !== newsletter.name) {
      fail(`Ghost did not confirm creation of newsletter: ${newsletter.name}`);
    }
    console.log(`CREATED: ${created.name} (${created.id})`);
  }

  const verification = await api('/newsletters/?limit=all');
  const verifiedNames = new Set((verification.newsletters || []).map(item => item.name));
  for (const required of REQUIRED) {
    if (!verifiedNames.has(required.name)) fail(`Verification failed: ${required.name} is missing`);
  }

  console.log('Newsletter setup verified.');
}

main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
