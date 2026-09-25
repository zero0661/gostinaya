import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const baseCss = fs.readFileSync(path.join(__dirname, '..', 'public', 'gostinaya.css'), 'utf8');
const spacingCss = fs.readFileSync(path.join(__dirname, '..', 'public', 'lounge-message-spacing.css'), 'utf8');

test('discussion messages preserve explicit line breaks but render them compactly', () => {
  assert.match(baseCss, /\.message-item p\s*\{[^}]*white-space:\s*pre-wrap;/s);
  assert.match(spacingCss, /\.message-item p\s*\{[^}]*line-height:\s*1\.4;/s);
});
