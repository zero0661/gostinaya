import test from 'node:test';
import assert from 'node:assert/strict';

import {
    normalizeRegistrationInput,
    validateRegistrationInput
} from '../services/RegistrationService.js';
import requireGuest from '../middleware/requireGuest.js';

test('registration accepts only name and email and normalizes them', () => {
    const input = normalizeRegistrationInput({ name: '  Nick  ', email: '  MEMBER@EXAMPLE.COM ' });
    assert.equal(input.name, 'Nick');
    assert.equal(input.email, 'member@example.com');
    assert.equal(validateRegistrationInput(input), null);
    assert.equal(input.language, 'ru');
    assert.equal(input.location, '');
});

test('registration rejects missing names and malformed email addresses', () => {
    assert.ok(validateRegistrationInput(normalizeRegistrationInput({ email: 'member@example.com' })));
    assert.ok(validateRegistrationInput(normalizeRegistrationInput({ name: 'Nick', email: 'invalid' })));
});

test('protected routes redirect visitors without a guest session', () => {
    let redirectedTo = null;

    requireGuest(
        { session: {} },
        { redirect: (url) => { redirectedTo = url; } },
        () => assert.fail('next must not run for a visitor')
    );

    assert.equal(redirectedTo, '/gostinaya/login');
});

test('protected routes allow an authenticated guest', () => {
    let continued = false;

    requireGuest(
        { session: { guest: { id: 42 } } },
        { redirect: () => assert.fail('authenticated guest must not be redirected') },
        () => { continued = true; }
    );

    assert.equal(continued, true);
});
