import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import ejs from 'ejs';

test('email GET and HEAD previews do not consume tokens; POST signs in once', async () => {
  const source = await fs.readFile(new URL('../app.js', import.meta.url), 'utf8');
  const routes = {};
  let calls = 0;
  let consumed = false;
  const guest = { id: 31, name: 'T', email: 'test@example.com', role: 'guest', language: 'ru' };
  const token = 'a'.repeat(64);
  vm.runInNewContext(source.slice(source.indexOf("app.get('/gostinaya/verify-email'"), source.indexOf("app.get('/gostinaya',")), {
    app: { get: (path, handler) => routes.get = handler, post: (path, handler) => routes.post = handler },
    EmailVerificationService: { verify: async value => { calls++; assert.equal(value, token); if (consumed) return null; consumed = true; return guest; } },
    normalizeAuthReturnTo: value => value === '/gostinaya/news' ? value : '',
    addReturnTo: (path, value) => value ? `${path}?returnTo=${encodeURIComponent(value)}` : path
  });
  const response = () => ({ code: 200, headers: {}, set(k,v) { this.headers[k] = v; return this; }, status(code) { this.code = code; return this; }, render(view, data) { this.view = view; this.data = data; }, redirect(url) { this.url = url; } });
  const template = await fs.readFile(new URL('../views/auth/verify-email.ejs', import.meta.url), 'utf8');
  for (const method of ['GET', 'HEAD', 'GET']) {
    const res = response();
    routes.get({ method, query: { token, returnTo: '/gostinaya/news' } }, res);
    assert.equal(calls, 0);
    assert.equal(res.code, 200);
    assert.equal(res.headers['Cache-Control'], 'no-store');
    assert.match(ejs.render(template, res.data), /method="post"/);
  }
  const req = { body: { token, returnTo: '/gostinaya/news' }, session: { regenerate(cb) { cb(); }, save(cb) { cb(); } } };
  const res = response();
  await routes.post(req, res, error => { throw error; });
  assert.equal(req.session.guest.id, 31);
  assert.equal(res.url, '/gostinaya/welcome?returnTo=%2Fgostinaya%2Fnews');
  const repeated = response();
  await routes.post(req, repeated, error => { throw error; });
  assert.equal(repeated.code, 400);
  assert.match(ejs.render(template, repeated.data), /Get a new sign-in link/);
  const malformed = response();
  routes.get({ query: { token: '<script>' } }, malformed);
  assert.equal(malformed.code, 400);
  assert.doesNotMatch(ejs.render(template, malformed.data), /<script>/);
});
