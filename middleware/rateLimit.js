const DEFAULT_MESSAGE =
    'Слишком много запросов. Попробуйте позже. / Too many requests. Try again later.';

function clientIp(req) {
    return String(req.ip || req.socket?.remoteAddress || 'unknown');
}

function normalizedEmail(req) {
    return String(req.body?.email || '').trim().toLowerCase() || 'no-email';
}

function guestOrIp(req) {
    return req.session?.guest?.id
        ? `guest:${req.session.guest.id}`
        : `ip:${clientIp(req)}`;
}

function sendLimitResponse(req, res, message) {
    if (req.path.includes('/api/') || req.originalUrl?.includes('/api/')) {
        return res.status(429).json({ message, error: message });
    }

    return res.status(429).send(message);
}

export function createRateLimiter({
    windowMs,
    max,
    keyGenerator = clientIp,
    message = DEFAULT_MESSAGE,
    maxEntries = 50_000,
    now = () => Date.now()
}) {
    if (!Number.isFinite(windowMs) || windowMs <= 0) {
        throw new TypeError('windowMs must be a positive number');
    }
    if (!Number.isInteger(max) || max <= 0) {
        throw new TypeError('max must be a positive integer');
    }

    const store = new Map();

    function removeExpired(currentTime) {
        for (const [key, entry] of store) {
            if (entry.resetAt <= currentTime) store.delete(key);
        }
    }

    return function rateLimit(req, res, next) {
        const currentTime = now();
        const key = String(keyGenerator(req));
        let entry = store.get(key);

        if (!entry || entry.resetAt <= currentTime) {
            if (!entry && store.size >= maxEntries) {
                removeExpired(currentTime);
                if (store.size >= maxEntries) {
                    store.delete(store.keys().next().value);
                }
            }

            entry = { count: 0, resetAt: currentTime + windowMs };
            store.set(key, entry);
        }

        const retryAfterSeconds = Math.max(
            1,
            Math.ceil((entry.resetAt - currentTime) / 1000)
        );

        res.set('RateLimit-Limit', String(max));
        res.set('RateLimit-Remaining', String(Math.max(0, max - entry.count - 1)));
        res.set('RateLimit-Reset', String(Math.ceil(entry.resetAt / 1000)));

        if (entry.count >= max) {
            res.set('Retry-After', String(retryAfterSeconds));
            return sendLimitResponse(req, res, message);
        }

        entry.count += 1;
        return next();
    };
}

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;

export const registrationRateLimit = createRateLimiter({
    windowMs: HOUR,
    max: 5
});

export const loginIpRateLimit = createRateLimiter({
    windowMs: 15 * MINUTE,
    max: 30
});

export const loginCredentialRateLimit = createRateLimiter({
    windowMs: 15 * MINUTE,
    max: 10,
    keyGenerator: req => `${clientIp(req)}:${normalizedEmail(req)}`
});

export const verificationResendRateLimit = createRateLimiter({
    windowMs: HOUR,
    max: 5
});

export const passwordResetRequestIpRateLimit = createRateLimiter({
    windowMs: HOUR,
    max: 10
});

export const passwordResetRequestEmailRateLimit = createRateLimiter({
    windowMs: HOUR,
    max: 3,
    keyGenerator: normalizedEmail
});

export const passwordResetCompletionRateLimit = createRateLimiter({
    windowMs: HOUR,
    max: 10
});

export const messagePublicationRateLimit = createRateLimiter({
    windowMs: 10 * MINUTE,
    max: 30,
    keyGenerator: guestOrIp
});

export const topicPublicationRateLimit = createRateLimiter({
    windowMs: HOUR,
    max: 5,
    keyGenerator: guestOrIp
});

export const reportPublicationRateLimit = createRateLimiter({
    windowMs: HOUR,
    max: 10,
    keyGenerator: guestOrIp
});
