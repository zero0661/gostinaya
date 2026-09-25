import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const css = fs.readFileSync(path.join(__dirname, '..', 'public', 'gostinaya.css'), 'utf8');

test('discussion messages use compact line spacing while preserving explicit line breaks', () => {
  assert.match(css, /\.message-item p\s*\{[^}]*line-height:\s*1\.4;/s);
  assert.match(css, /\.message-item p\s*\{[^}]*white-space:\s*pre-wrap;/s);
});
