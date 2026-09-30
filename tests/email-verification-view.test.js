import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import ejs from 'ejs';

async function harness() {
  const view = await fs.readFile(new URL('../views/auth/check-email.ejs', import.meta.url), 'utf8');
  const html = ejs.render(view, { email: 'new@example.com' });
  const listeners = new Map();
  const requests = [], redirects = [];
  const window = {
    getLoungeLanguage: () => 'en',
    location: { replace: url => redirects.push(url) },
    setInterval: callback => callback(),
    setTimeout: callback => callback()
  };
  const context = vm.createContext({
    window,
    document: {
      hidden: false,
      documentElement: { dataset: { loungeLang: 'en' } },
      addEventListener: (event, handler) => listeners.set(event, handler),
      getElementById: () => ({ addEventListener: (event, handler) => listeners.set(event, handler) })
    },
    fetch: async (url, options) => {
      requests.push({ url, options });
      // A different account is already authenticated in this browser.
      return { json: async () => ({ authenticated: true, message: 'Sent' }) };
    }
  });
  for (const script of html.matchAll(/<script>([\s\S]*?)<\/script>/g)) vm.runInContext(script[1], context);
  await new Promise(resolve => setImmediate(resolve));
  return { listeners, requests, redirects };
}

test('waiting for a new email does not redirect into an existing browser session', async () => {
  const h = await harness();
  assert.equal(h.requests.length, 0);
  assert.deepEqual(h.redirects, []);
  assert.equal(h.listeners.has('visibilitychange'), false);
});

test('waiting page can resend to the requested address without entering another account', async () => {
  const h = await harness();
  const button = { disabled: false }, message = { textContent: '' };
  const form = { elements: { email: { value: 'new@example.com' } }, querySelector: selector => selector === 'button' ? button : message };
  await h.listeners.get('submit')({ preventDefault() {}, currentTarget: form });
  assert.equal(h.requests[0].url, '/gostinaya/api/guests/resend-verification');
  assert.equal(JSON.parse(h.requests[0].options.body).email, 'new@example.com');
  assert.deepEqual(h.redirects, []);
  assert.equal(button.disabled, false);
});
