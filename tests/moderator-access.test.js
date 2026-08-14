import test from 'node:test';
import assert from 'node:assert/strict';
import requireModerator from '../middleware/requireModerator.js';

function runMiddleware(guest) {
  const result = { next: false, redirect: null, status: null, body: null };
  const req = { session: guest ? { guest } : {} };
  const res = {
    redirect(value) { result.redirect = value; return value; },
    status(value) { result.status = value; return this; },
    send(value) { result.body = value; return value; }
  };
  requireModerator(req, res, () => { result.next = true; });
  return result;
}

test('moderation access redirects visitors and rejects ordinary members', () => {
  assert.equal(runMiddleware(null).redirect, '/gostinaya/login');
  assert.equal(runMiddleware({ id: 1, role: 'guest' }).status, 403);
  assert.equal(runMiddleware({ id: 2, role: 'author' }).status, 403);
});

test('moderation access accepts moderators and administrators', () => {
  assert.equal(runMiddleware({ id: 1, role: 'moderator' }).next, true);
  assert.equal(runMiddleware({ id: 2, role: 'admin' }).next, true);
});
