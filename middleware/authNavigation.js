import { normalizeAuthReturnTo } from '../utils/authRedirect.js';

const ENTRY_PAGES = new Set(['/login', '/register', '/check-email', '/verify-email']);

export function preventLoungePageCaching(req, res, next) {
    if (!req.path.startsWith('/public/')) {
        res.set('Cache-Control', 'private, no-store, max-age=0');
    }
    next();
}

// Mount after the account refresh, so blocked/deleted accounts cannot bypass it.
export function redirectAuthenticatedGuest(req, res, next) {
    if (!req.session?.guest?.id) return next();

    const destination = normalizeAuthReturnTo(
        req.query?.returnTo || req.body?.returnTo
    ) || '/gostinaya/hall';

    if (['GET', 'HEAD'].includes(req.method) && ENTRY_PAGES.has(req.path)) {
        return res.redirect(destination);
    }
    if (req.method === 'POST' && req.path === '/verify-email') {
        return res.redirect(303, destination);
    }
    if (req.method === 'POST' && req.path === '/api/guests/login') {
        return res.json({ success: true, redirect: destination });
    }
    return next();
}
