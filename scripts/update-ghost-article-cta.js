#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const APPLY = process.argv.includes('--apply');
const GHOST_URL = 'https://milenin.pro';
const DB_CONTAINER = 'ghost-db-1';
const GHOST_CONTAINER = 'ghost-ghost-1';
const THEME_FILE = '/var/lib/docker/volumes/ghost_ghost_content/_data/themes/liebling/post.hbs';
const BACKUP_ROOT = '/root/ghost-theme-backups';

const OLD_HEADINGS = new Set([
  'Что-то в статье вас затронуло?',
  'Did Something in This Article Speak to You?'
]);

const OLD_ENDINGS = [
  'После логина всё только начинается.',
  'After Login, everything is just beginning.'
];

const NEW_TEMPLATE = String.raw`            <section class="after-login-invitation">
                {{#has tag="English"}}
                    <h2>The Conversation Continues in the Lounge</h2>
                    <p>
                        The article ends here, but the conversation doesn’t. In the project Lounge,
                        you can discuss what you’ve read, disagree with the author, reply to other
                        readers, or start a topic of your own.
                    </p>
                    <div class="after-login-invitation__actions">
                        <a class="after-login-invitation__button after-login-invitation__button--primary"
                           href="https://milenin.pro/gostinaya/article/{{id}}">Discuss This Article</a>
                        <a class="after-login-invitation__button after-login-invitation__button--secondary"
                           href="mailto:pm@milenin.pro">Email the Author</a>
                    </div>
                    <p class="after-login-invitation__motto"><em>After Login, everything is just beginning.</em></p>
                {{else}}
                    <h2>Разговор продолжается в Гостиной</h2>
                    <p>
                        Статья заканчивается здесь, но разговор — нет. В Гостиной проекта можно
                        обсудить прочитанное, поспорить с автором, ответить другим читателям
                        или начать собственную тему.
                    </p>
                    <div class="after-login-invitation__actions">
                        <a class="after-login-invitation__button after-login-invitation__button--primary"
                           href="https://milenin.pro/gostinaya/article/{{id}}">Обсудить статью</a>
                        <a class="after-login-invitation__button after-login-invitation__button--secondary"
                           href="mailto:pm@milenin.pro">Написать автору</a>
                    </div>
                    <p class="after-login-invitation__motto"><em>После логина всё только начинается.</em></p>
                {{/has}}

                <style class="after-login-invitation__styles">
                    .after-login-invitation {
                        margin: 3.5rem 0 3rem;
                        padding: clamp(1.6rem, 4vw, 2.6rem);
                        color: #f4f0e8;
                        text-align: center;
                        background:
                            radial-gradient(circle at top left, rgba(169, 117, 255, .17), transparent 42%),
                            linear-gradient(145deg, #19171f 0%, #111116 100%);
                        border: 1px solid rgba(255, 255, 255, .1);
                        border-radius: 22px;
                        box-shadow: 0 20px 55px rgba(0, 0, 0, .22);
                    }

                    .after-login-invitation h2 {
                        margin: 0 0 1rem;
                        color: #fff;
                        font-size: clamp(1.55rem, 3vw, 2.1rem);
                        line-height: 1.25;
                    }

                    .after-login-invitation > p:not(.after-login-invitation__motto) {
                        max-width: 46rem;
                        margin: 0 auto;
                        color: rgba(244, 240, 232, .76);
                        font-size: 1rem;
                        line-height: 1.75;
                    }

                    .after-login-invitation__actions {
                        display: flex;
                        justify-content: center;
                        flex-wrap: wrap;
                        gap: .8rem;
                        margin: 1.7rem 0 1.35rem;
                    }

                    .after-login-invitation__button {
                        display: inline-flex;
                        align-items: center;
                        justify-content: center;
                        min-height: 3rem;
                        padding: .78rem 1.3rem;
                        border-radius: 999px;
                        font-weight: 700;
                        line-height: 1.2;
                        text-decoration: none;
                        transition: transform .18s ease, background .18s ease, border-color .18s ease;
                    }

                    .after-login-invitation__button:hover {
                        transform: translateY(-2px);
                        text-decoration: none;
                    }

                    .after-login-invitation__button--primary {
                        color: #161219 !important;
                        background: linear-gradient(135deg, #f2d9a7, #c8a5ff);
                        border: 1px solid transparent;
                    }

                    .after-login-invitation__button--secondary {
                        color: #f4f0e8;
                        background: rgba(255, 255, 255, .045);
                        border: 1px solid rgba(255, 255, 255, .18);
                    }

                    .after-login-invitation__motto {
                        margin: 0;
                        color: rgba(244, 240, 232, .58);
                        font-family: Georgia, serif;
                        font-size: .98rem;
                    }

                    @media (max-width: 600px) {
                        .after-login-invitation__actions {
                            flex-direction: column;
                        }

                        .after-login-invitation__button {
                            width: 100%;
                        }
                    }
                </style>
            </section>`;

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

function getText(node) {
  if (!node || typeof node !== 'object') return '';
  const own = typeof node.text === 'string' ? node.text : '';
  const children = Array.isArray(node.children) ? node.children.map(getText).join('') : '';
  return own + children;
}

function normalize(value) {
  return value.replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
}

function stripOldInvitation(lexicalString, title) {
  const document = JSON.parse(lexicalString);
  const nodes = document?.root?.children;
  if (!Array.isArray(nodes)) fail(`Unexpected Lexical document: ${title}`);

  const start = nodes.findIndex(node => OLD_HEADINGS.has(normalize(getText(node))));
  if (start === -1) return { changed: false, lexical: lexicalString };

  let end = -1;
  for (let index = start + 1; index < nodes.length; index++) {
    const content = normalize(getText(nodes[index]));
    if (OLD_ENDINGS.some(ending => content === ending)) {
      end = index;
      break;
    }
  }

  if (end === -1 || end - start > 8) {
    fail(`Old invitation has an unexpected boundary: ${title}`);
  }

  const blockText = normalize(nodes.slice(start, end + 1).map(getText).join(' '));
  if (!blockText.includes('pm@milenin.pro')) {
    fail(`Email marker missing inside old invitation: ${title}`);
  }

  nodes.splice(start, end - start + 1);
  return { changed: true, lexical: JSON.stringify(document) };
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
      'Accept-Version': 'v5.0',
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });

  const body = await response.text();
  if (!response.ok) fail(`Ghost API ${response.status}: ${body.slice(0, 800)}`);
  return body ? JSON.parse(body) : {};
}

function replaceThemeBlock(source) {
  if ((source.match(/<section class="after-login-discuss">/g) || []).length !== 1) {
    fail('Expected exactly one old after-login-discuss section');
  }

  const replaced = source.replace(
    /\s*<section class="after-login-discuss">[\s\S]*?<\/section>/,
    `\n\n${NEW_TEMPLATE}`
  );

  if (replaced === source || replaced.includes('after-login-discuss')) {
    fail('Theme invitation replacement did not pass verification');
  }
  if (!replaced.includes('after-login-invitation') || !replaced.includes('{{#has tag="English"}}')) {
    fail('New theme invitation is incomplete');
  }
  return replaced;
}

async function updatePost(post, lexical) {
  return api(`/posts/${post.id}/`, {
    method: 'PUT',
    body: JSON.stringify({ posts: [{ id: post.id, lexical, updated_at: post.updated_at }] })
  });
}

async function main() {
  const themeSource = fs.readFileSync(THEME_FILE, 'utf8');
  const updatedTheme = replaceThemeBlock(themeSource);

  const key = mysql(`
    SELECT CONCAT(id, ':', secret)
    FROM api_keys
    WHERE type = 'admin'
    ORDER BY created_at DESC
    LIMIT 1
  `);
  globalThis.adminToken = createToken(key);

  const listing = await api('/posts/?limit=all&formats=lexical,html&include=tags&filter=status:published');
  const posts = listing.posts || [];
  const changes = [];

  for (const post of posts) {
    if (!post.lexical) continue;
    const result = stripOldInvitation(post.lexical, post.title);
    if (result.changed) changes.push({ post, lexical: result.lexical });
  }

  const ru = changes.filter(({ post }) => !(post.tags || []).some(tag => tag.slug === 'english')).length;
  const en = changes.length - ru;

  console.log(`Published posts: ${posts.length}`);
  console.log(`Old invitations found: ${changes.length} (RU ${ru}, EN ${en})`);
  console.log('Theme block: ready to replace');

  if (posts.length !== 24 || changes.length !== 18 || ru !== 9 || en !== 9) {
    fail('Inventory differs from expected 24 posts / 18 old invitations / 9 RU / 9 EN');
  }

  if (!APPLY) {
    console.log('Dry run passed. Nothing changed. Run again with --apply.');
    return;
  }

  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, '');
  const backupDir = path.join(BACKUP_ROOT, `article-invitation-${stamp}`);
  fs.mkdirSync(backupDir, { recursive: true });
  fs.writeFileSync(path.join(backupDir, 'post.hbs'), themeSource);
  fs.writeFileSync(
    path.join(backupDir, 'posts.json'),
    JSON.stringify(changes.map(({ post }) => ({ id: post.id, title: post.title, updated_at: post.updated_at, lexical: post.lexical })), null, 2)
  );

  const dump = run('docker', [
    'exec', DB_CONTAINER, 'sh', '-lc',
    'mysqldump -uroot -p"$MYSQL_ROOT_PASSWORD" --single-transaction "$MYSQL_DATABASE"'
  ], { binary: true });
  fs.writeFileSync(path.join(backupDir, 'ghost.sql'), dump);

  const updated = [];
  let themeWritten = false;
  try {
    for (const change of changes) {
      const response = await updatePost(change.post, change.lexical);
      const saved = response.posts?.[0];
      if (!saved) fail(`Ghost returned no updated post: ${change.post.title}`);
      updated.push({ original: change.post, current: saved });
      console.log(`Updated: ${change.post.title}`);
    }

    fs.writeFileSync(THEME_FILE, updatedTheme);
    themeWritten = true;
    run('docker', ['restart', GHOST_CONTAINER]);

    const status = run('docker', ['inspect', '-f', '{{.State.Running}}', GHOST_CONTAINER]).trim();
    if (status !== 'true') fail('Ghost container is not running after restart');

    console.log(`Backup: ${backupDir}`);
    console.log('Updated posts: 18');
    console.log('Theme: updated');
    console.log('Ghost: restarted and running');
  } catch (error) {
    console.error(`Apply failed: ${error.message}`);
    if (themeWritten) {
      fs.writeFileSync(THEME_FILE, themeSource);
      run('docker', ['restart', GHOST_CONTAINER]);
    }

    for (const item of updated.reverse()) {
      try {
        const latest = await api(`/posts/${item.original.id}/?formats=lexical`);
        const current = latest.posts?.[0];
        if (current) {
          await updatePost({ ...item.original, updated_at: current.updated_at }, item.original.lexical);
        }
      } catch (rollbackError) {
        console.error(`Rollback failed for ${item.original.title}: ${rollbackError.message}`);
      }
    }
    throw error;
  }
}

main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
