#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const APPLY = process.argv.includes('--apply');
const GHOST_URL = 'https://milenin.pro';
const DB_CONTAINER = 'ghost-db-1';
const GHOST_CONTAINER = 'ghost-ghost-1';
const THEME_ROOT = '/var/lib/docker/volumes/ghost_ghost_content/_data/themes/liebling';
const BACKUP_ROOT = '/root/ghost-theme-backups';
const OLD_EMAIL = 'pm@milenin.pro';
const NEW_EMAIL = 'milen.petr@gmail.com';
const TEXT_EXTENSIONS = new Set(['.hbs', '.html', '.js', '.css', '.json', '.md']);

function fail(message) {
  throw new Error(message);
}

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

function occurrences(value, needle) {
  if (!value) return 0;
  return String(value).split(needle).length - 1;
}

function replacement(value) {
  return String(value).split(OLD_EMAIL).join(NEW_EMAIL);
}

function walkTextFiles(root) {
  const result = [];
  const queue = [root];

  while (queue.length) {
    const current = queue.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        queue.push(fullPath);
      } else if (entry.isFile() && TEXT_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
        result.push(fullPath);
      }
    }
  }

  return result;
}

async function browse(resource) {
  const data = await api(`/${resource}/?limit=all&formats=lexical&filter=status:published`);
  return data[resource] || [];
}

async function updateResource(resource, item, lexical) {
  return api(`/${resource}/${item.id}/`, {
    method: 'PUT',
    body: JSON.stringify({
      [resource]: [{ id: item.id, lexical, updated_at: item.updated_at }]
    })
  });
}

async function main() {
  globalThis.adminToken = createToken(mysql(`
    SELECT CONCAT(id, ':', secret)
    FROM api_keys
    WHERE type = 'admin'
    ORDER BY created_at DESC
    LIMIT 1
  `));

  const [posts, pages] = await Promise.all([browse('posts'), browse('pages')]);
  const contentChanges = [];

  for (const [resource, items] of [['posts', posts], ['pages', pages]]) {
    for (const item of items) {
      const count = occurrences(item.lexical, OLD_EMAIL);
      if (!count) continue;
      contentChanges.push({
        resource,
        item,
        count,
        lexical: replacement(item.lexical)
      });
    }
  }

  const themeChanges = [];
  for (const file of walkTextFiles(THEME_ROOT)) {
    const source = fs.readFileSync(file, 'utf8');
    const count = occurrences(source, OLD_EMAIL);
    if (!count) continue;
    themeChanges.push({ file, source, count, updated: replacement(source) });
  }

  const contentCount = contentChanges.reduce((sum, item) => sum + item.count, 0);
  const themeCount = themeChanges.reduce((sum, item) => sum + item.count, 0);

  console.log(`Contact replacement: ${OLD_EMAIL} -> ${NEW_EMAIL}`);
  console.log(`Published posts/pages with matches: ${contentChanges.length} (${contentCount} occurrences)`);
  for (const change of contentChanges) {
    console.log(`CONTENT: ${change.resource}/${change.item.slug || change.item.id} (${change.count})`);
  }
  console.log(`Theme files with matches: ${themeChanges.length} (${themeCount} occurrences)`);
  for (const change of themeChanges) {
    console.log(`THEME: ${path.relative(THEME_ROOT, change.file)} (${change.count})`);
  }

  if (!contentChanges.length && !themeChanges.length) {
    console.log('Old contact email not found. Nothing to change.');
    return;
  }

  if (!APPLY) {
    console.log('Dry run passed. Nothing changed. Run again with --apply.');
    return;
  }

  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, '');
  const backupDir = path.join(BACKUP_ROOT, `contact-email-${stamp}`);
  const themeBackupDir = path.join(backupDir, 'theme');
  fs.mkdirSync(themeBackupDir, { recursive: true });

  fs.writeFileSync(
    path.join(backupDir, 'ghost-content.json'),
    JSON.stringify(contentChanges.map(change => ({
      resource: change.resource,
      id: change.item.id,
      slug: change.item.slug,
      title: change.item.title,
      updated_at: change.item.updated_at,
      lexical: change.item.lexical
    })), null, 2)
  );

  for (const change of themeChanges) {
    const relative = path.relative(THEME_ROOT, change.file);
    const destination = path.join(themeBackupDir, relative);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.writeFileSync(destination, change.source);
  }

  const dump = run('docker', [
    'exec', DB_CONTAINER, 'sh', '-lc',
    'mysqldump -uroot -p"$MYSQL_ROOT_PASSWORD" --single-transaction "$MYSQL_DATABASE"'
  ], { binary: true });
  fs.writeFileSync(path.join(backupDir, 'ghost.sql'), dump);

  for (const change of contentChanges) {
    await updateResource(change.resource, change.item, change.lexical);
    console.log(`UPDATED CONTENT: ${change.resource}/${change.item.slug || change.item.id}`);
  }

  for (const change of themeChanges) {
    fs.writeFileSync(change.file, change.updated);
    console.log(`UPDATED THEME: ${path.relative(THEME_ROOT, change.file)}`);
  }

  if (themeChanges.length) {
    run('docker', ['restart', GHOST_CONTAINER]);
    const status = run('docker', ['inspect', '-f', '{{.State.Running}}', GHOST_CONTAINER]).trim();
    if (status !== 'true') fail('Ghost container is not running after restart');
  }

  const verification = [];
  const [verifiedPosts, verifiedPages] = await Promise.all([browse('posts'), browse('pages')]);
  for (const item of [...verifiedPosts, ...verifiedPages]) {
    if (occurrences(item.lexical, OLD_EMAIL)) verification.push(item.slug || item.id);
  }
  for (const file of walkTextFiles(THEME_ROOT)) {
    if (occurrences(fs.readFileSync(file, 'utf8'), OLD_EMAIL)) {
      verification.push(path.relative(THEME_ROOT, file));
    }
  }

  if (verification.length) {
    fail(`Verification failed; old email remains in: ${verification.join(', ')}`);
  }

  console.log(`Backup: ${backupDir}`);
  console.log('Contact email replacement verified.');
}

main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
