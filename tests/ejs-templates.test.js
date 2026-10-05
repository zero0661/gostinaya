import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ejs from 'ejs';

const dirname = path.dirname(fileURLToPath(import.meta.url));
const viewsDir = path.join(dirname, '..', 'views');

async function listEjsFiles(directory) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...await listEjsFiles(fullPath));
    } else if (entry.isFile() && entry.name.endsWith('.ejs')) {
      files.push(fullPath);
    }
  }

  return files;
}

test('all EJS templates compile after the locale split', async () => {
  const files = await listEjsFiles(viewsDir);
  assert.ok(files.length > 0, 'expected EJS templates in views/');

  for (const file of files) {
    const source = await fs.readFile(file, 'utf8');
    assert.doesNotThrow(
      () => ejs.compile(source, { filename: file }),
      `EJS syntax error in ${path.relative(viewsDir, file)}`
    );
  }
});


test('public Lounge entry honors the language of the referring site page', async () => {
  const layout = await fs.readFile(path.join(viewsDir, 'layouts', 'public.ejs'), 'utf8');

  assert.match(layout, /document\.referrer/);
  assert.match(layout, /\/\^\\\/en\(\?:\\\/\|\$\)\/i/);
  assert.match(layout, /referrerLanguage \|\|/);
  assert.ok(
    layout.indexOf('referrerLanguage ||') < layout.indexOf("stored === 'en' || stored === 'ru'"),
    'referrer language should win over a previously stored Lounge language'
  );
});
