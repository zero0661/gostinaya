import test from 'node:test';
import assert from 'node:assert/strict';
import { createRateLimiter } from '../middleware/rateLimit.js';

function response() {
    return {
        headers: {},
        statusCode: 200,
        body: null,
        set(name, value) {
            this.headers[name] = value;
            return this;
        },
        status(code) {
            this.statusCode = code;
            return this;
        },
        json(body) {
            this.body = body;
            return this;
        },
        send(body) {
            this.body = body;
            return this;
        }
    };
}

test('rate limiter allows the configured number of requests and then returns 429', () => {
    let currentTime = 1_000;
    const limiter = createRateLimiter({
        windowMs: 60_000,
        max: 2,
        now: () => currentTime
    });
    const req = { ip: '203.0.113.1', path: '/api/login', originalUrl: '/api/login' };

    for (let index = 0; index < 2; index += 1) {
        const res = response();
        let continued = false;
        limiter(req, res, () => { continued = true; });
        assert.equal(continued, true);
        assert.equal(res.statusCode, 200);
    }

    const blocked = response();
    let continued = false;
    limiter(req, blocked, () => { continued = true; });
    assert.equal(continued, false);
    assert.equal(blocked.statusCode, 429);
    assert.match(blocked.body.message, /Слишком много запросов/);
    assert.equal(blocked.body.error, blocked.body.message);
    assert.equal(blocked.headers['Retry-After'], '60');

    currentTime += 60_001;
    const renewed = response();
    limiter(req, renewed, () => { continued = true; });
    assert.equal(continued, true);
});

test('rate limiter keeps independent counters for different keys', () => {
    const limiter = createRateLimiter({
        windowMs: 60_000,
        max: 1,
        keyGenerator: req => req.session.guest.id,
        now: () => 10_000
    });

    for (const id of [1, 2]) {
        const res = response();
        let continued = false;
        limiter({ session: { guest: { id } }, path: '/topic' }, res, () => {
            continued = true;
        });
        assert.equal(continued, true);
    }
});

test('public write routes are protected by their dedicated limiters', async () => {
    const fs = await import('node:fs/promises');
    const app = await fs.readFile(new URL('../app.js', import.meta.url), 'utf8');

    assert.match(app, /register', registrationRateLimit/);
    assert.match(app, /login', loginIpRateLimit, loginCredentialRateLimit/);
    assert.match(app, /request-password-reset',[\s\S]*?passwordResetRequestIpRateLimit,[\s\S]*?passwordResetRequestEmailRateLimit/);
    assert.match(app, /reset-password', passwordResetCompletionRateLimit/);
    assert.match(app, /topic\/:id\/messages', messagePublicationRateLimit/);
    assert.match(app, /:room\/new', topicPublicationRateLimit/);
    assert.match(app, /reports', reportPublicationRateLimit, reportsRouter/);
});
