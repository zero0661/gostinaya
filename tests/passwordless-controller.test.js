import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import crypto from 'node:crypto';
import {
  normalizePublicLanguage,
  normalizeRegistrationInput,
  validateRegistrationInput
} from '../services/RegistrationService.js';
import { normalizeAuthReturnTo } from '../utils/authRedirect.js';

async function harness(existing = null) {
  const created = [], issued = [], passwords = [];
  const guest = { id: 1, name: 'Nick', email: 'nick@example.com', language: 'en' };
  const source = (await fs.readFile(new URL('../controllers/GuestController.js', import.meta.url), 'utf8'))
    .replace(/^import[\s\S]*?;\n/gm, '')
    .replace('export default new GuestController();', 'globalThis.controller = new GuestController();');
  const context = vm.createContext({
    crypto,
    console,
    normalizePublicLanguage,
    normalizeRegistrationInput,
    validateRegistrationInput,
    normalizeAuthReturnTo,
    GuestRepository: {
      findByEmail: async () => existing,
      create: async input => {
        created.push(input);
        return guest;
      }
    },
    AuthService: {
      hashPassword: async value => {
        passwords.push(value);
        return 'hashed-random-secret';
      }
    },
    EmailVerificationService: {
      issue: async (value, returnTo) => {
        issued.push({ guest: value, returnTo });
      }
    },
    PasswordResetService: {}
  });
  vm.runInContext(source, context);
  const response = {
    code: 200,
    body: null,
    status(code) {
      this.code = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    }
  };
  return { controller: context.controller, response, created, issued, passwords };
}

test('minimal registration creates an account, retains interface language, and sends an entry link', async () => {
  const h = await harness();
  await h.controller.register({
    body: {
      name: 'Nick',
      email: 'nick@example.com',
      language: 'en',
      returnTo: '/gostinaya/topic/9'
    }
  }, h.response);

  assert.equal(h.response.code, 200);
  assert.equal(h.created[0].language, 'en');
  assert.equal(h.created[0].country, '');
  assert.match(h.passwords[0], /^[a-f0-9]{64}$/);
  assert.equal(h.issued[0].returnTo, '/gostinaya/topic/9');
  assert.match(h.response.body.redirect, /check-email/);
  assert.match(h.response.body.redirect, /lang=en/);
});

test('an existing registration sends an entry link without renaming the account', async () => {
  const existing = {
    id: 7,
    name: 'Original',
    email: 'nick@example.com',
    email_verified_at: '2026-09-01'
  };
  const h = await harness(existing);

  await h.controller.register({
    body: {
      name: 'New name',
      email: existing.email,
      language: 'en'
    }
  }, h.response);

  assert.equal(h.response.code, 200);
  assert.equal(h.created.length, 0);
  assert.equal(h.issued[0].guest.name, 'Original');
  assert.match(h.response.body.redirect, /lang=en/);
});

test('email-only login sends a link, while unknown and blocked accounts receive the same neutral response', async () => {
  for (const guest of [{ id: 7 }, null, { id: 7, is_blocked: 1 }]) {
    const h = await harness(guest);

    await h.controller.login({
      body: {
        email: 'nick@example.com',
        language: 'en'
      }
    }, h.response);

    assert.equal(h.response.code, 200);
    assert.match(h.response.body.redirect, /check-email/);
    assert.match(h.response.body.redirect, /lang=en/);
    assert.equal(h.issued.length, guest && !guest.is_blocked ? 1 : 0);
  }
});
