import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(
  new URL('../repositories/GuestRepository.js', import.meta.url),
  'utf8'
);

test('public member queries include administrators and keep internal roles hidden', () => {
  const publicRoleFilter = /g\.role IN \('guest', 'author', 'moderator', 'admin'\)/g;

  assert.equal(
    [...source.matchAll(publicRoleFilter)].length,
    2,
    'both the member profile and member list must use the public role filter'
  );
  assert.doesNotMatch(source, /g\.role IN \([^)]*'system'/);
  assert.doesNotMatch(source, /g\.role IN \([^)]*'legacy'/);
});
