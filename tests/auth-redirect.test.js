import test from 'node:test';
import assert from 'node:assert/strict';
import { addReturnTo, normalizeAuthReturnTo } from '../utils/authRedirect.js';

test('accepts only internal article and topic return paths', () => {
    assert.equal(
        normalizeAuthReturnTo('/gostinaya/article/6a58c93588cc33000189a025'),
        '/gostinaya/article/6a58c93588cc33000189a025'
    );
    assert.equal(
        normalizeAuthReturnTo('/gostinaya/topic/26#message-10'),
        '/gostinaya/topic/26#message-10'
    );
    assert.equal(normalizeAuthReturnTo('https://evil.example'), '');
    assert.equal(normalizeAuthReturnTo('//evil.example'), '');
    assert.equal(normalizeAuthReturnTo('/gostinaya/hall'), '');
});

test('adds a safely encoded return path to an auth URL', () => {
    assert.equal(
        addReturnTo('/gostinaya/login', '/gostinaya/article/post-id'),
        '/gostinaya/login?returnTo=%2Fgostinaya%2Farticle%2Fpost-id'
    );
});
