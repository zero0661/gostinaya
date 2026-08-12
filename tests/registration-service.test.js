import test from 'node:test';
import assert from 'node:assert/strict';

import {
    normalizeRegistrationInput,
    validateRegistrationInput
} from '../services/RegistrationService.js';
import requireGuest from '../middleware/requireGuest.js';

test('registration input is normalized and preserves the onboarding answers', () => {
    const input = normalizeRegistrationInput({
        name: '  Test Member  ',
        email: '  MEMBER@EXAMPLE.COM ',
        password: 'password123',
        country: ' Netherlands ',
        city: ' Amsterdam ',
        language: 'en',
        joinReason: ' To discuss the articles. ',
        currentTopic: ' Human and AI communication. ',
        acceptsRules: true,
        acceptsPrivacy: true
    });

    assert.equal(input.name, 'Test Member');
    assert.equal(input.email, 'member@example.com');
    assert.equal(input.location, 'Amsterdam, Netherlands');
    assert.equal(input.language, 'en');
    assert.equal(validateRegistrationInput(input), null);
});

test('registration requires both onboarding answers and both consents', () => {
    const input = normalizeRegistrationInput({
        name: 'Test Member',
        email: 'member@example.com',
        password: 'password123',
        country: 'Netherlands',
        city: 'Amsterdam',
        language: 'en'
    });

    assert.match(validateRegistrationInput(input), /ответьте|answer both/i);

    input.joinReason = 'Because I read the project.';
    input.currentTopic = 'AI and people.';
    assert.match(validateRegistrationInput(input), /Правила|accept the Lounge Rules/i);
});

test('registration rejects a missing language instead of silently choosing one', () => {
    const input = normalizeRegistrationInput({
        name: 'Test Member',
        email: 'member@example.com',
        password: 'password123',
        country: 'Netherlands',
        city: 'Amsterdam',
        joinReason: 'Because I read the project.',
        currentTopic: 'AI and people.',
        acceptsRules: true,
        acceptsPrivacy: true
    });

    assert.equal(input.language, '');
    assert.match(validateRegistrationInput(input), /страну, город и язык|country, city and language/i);
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
