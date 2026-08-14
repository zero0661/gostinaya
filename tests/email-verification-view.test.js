import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dirname = path.dirname(fileURLToPath(import.meta.url));

test('the waiting page follows a verification completed in another browser window', async () => {
  const app = await fs.readFile(path.join(dirname, '..', 'app.js'), 'utf8');
  const view = await fs.readFile(path.join(dirname, '..', 'views', 'auth', 'check-email.ejs'), 'utf8');

  assert.match(app, /\/gostinaya\/api\/session-status/);
  assert.match(app, /authenticated: Boolean\(req\.session\?\.guest\?\.id\)/);
  assert.match(view, /fetch\('\/gostinaya\/api\/session-status'/);
  assert.match(view, /window\.location\.replace\('\/gostinaya\/welcome'\)/);
  assert.match(view, /setInterval\(checkVerificationStatus, 2500\)/);
});
