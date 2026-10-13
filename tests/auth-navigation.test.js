import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { preventLoungePageCaching, redirectAuthenticatedGuest } from '../middleware/authNavigation.js';

test('active sessions bypass the email flow and keep safe discussion destinations', async t => {
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => {
    req.session = req.get('x-test-session') === 'active' ? { guest: { id: 16 } } : {};
    next();
  });
  let mailRequests = 0;
  let tokenUses = 0;
  app.use('/gostinaya', preventLoungePageCaching, redirectAuthenticatedGuest);
  app.get(['/gostinaya/login', '/gostinaya/register', '/gostinaya/check-email', '/gostinaya/verify-email'], (req, res) => res.send('public entry'));
  app.post('/gostinaya/verify-email', (req, res) => { tokenUses++; res.status(400).send('invalid token'); });
  app.post('/gostinaya/api/guests/login', (req, res) => { mailRequests++; res.json({ success: true, redirect: '/gostinaya/check-email' }); });
  app.get('/gostinaya/hall', (req, res) => res.send('hall'));
  app.get('/gostinaya/public/test.css', (req, res) => res.send('asset'));
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = 'http://127.0.0.1:' + server.address().port;
  const request = (path, options = {}) => fetch(base + path, { redirect: 'manual', ...options });
  for (const path of ['login', 'register', 'check-email', 'verify-email?token=used']) {
    const r = await request('/gostinaya/' + path, { headers: { 'x-test-session': 'active' } });
    assert.equal(r.status, 302);
    assert.equal(r.headers.get('location'), '/gostinaya/hall');
    assert.match(r.headers.get('cache-control'), /no-store/);
  }
  for (const returnTo of ['/gostinaya/topic/56#message-4', '/gostinaya/article/post-id?lang=en']) {
    const r = await request('/gostinaya/login?returnTo=' + encodeURIComponent(returnTo), { headers: { 'x-test-session': 'active' } });
    assert.equal(r.headers.get('location'), returnTo);
  }
  for (const returnTo of ['https://evil.example', '//evil.example', '/gostinaya/login']) {
    const r = await request('/gostinaya/login?returnTo=' + encodeURIComponent(returnTo), { headers: { 'x-test-session': 'active' } });
    assert.equal(r.headers.get('location'), '/gostinaya/hall');
  }
  let r = await request('/gostinaya/verify-email', { method: 'POST', headers: { 'x-test-session': 'active', 'content-type': 'application/json' }, body: JSON.stringify({ token: 'used', returnTo: '/gostinaya/topic/56' }) });
  assert.equal(r.status, 303);
  assert.equal(r.headers.get('location'), '/gostinaya/topic/56');
  assert.equal(tokenUses, 0);
  r = await request('/gostinaya/api/guests/login', { method: 'POST', headers: { 'x-test-session': 'active', 'content-type': 'application/json' }, body: JSON.stringify({ email: 'owner@example.com' }) });
  assert.deepEqual(await r.json(), { success: true, redirect: '/gostinaya/hall' });
  assert.equal(mailRequests, 0);
  r = await request('/gostinaya/login');
  assert.equal(r.status, 200);
  assert.match(r.headers.get('cache-control'), /no-store/);
  r = await request('/gostinaya/verify-email', { method: 'POST' });
  assert.equal(r.status, 400);
  assert.equal(tokenUses, 1);
  r = await request('/gostinaya/api/guests/login', { method: 'POST' });
  assert.equal(r.status, 200);
  assert.equal(mailRequests, 1);
  r = await request('/gostinaya/public/test.css');
  assert.equal(r.headers.get('cache-control'), null);
  r = await request('/gostinaya/login', { method: 'HEAD', headers: { 'x-test-session': 'active' } });
  assert.equal(r.status, 302);
});
