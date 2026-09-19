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
