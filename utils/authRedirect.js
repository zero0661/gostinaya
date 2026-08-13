const ALLOWED_RETURN_TO = /^\/gostinaya\/(?:article\/[^/?#]+|topic\/\d+)(?:[?#].*)?$/;

export function normalizeAuthReturnTo(value) {
    const returnTo = String(value || '').trim();

    if (
        !returnTo ||
        returnTo.includes('\\') ||
        returnTo.startsWith('//') ||
        !ALLOWED_RETURN_TO.test(returnTo)
    ) {
        return '';
    }

    return returnTo;
}

export function addReturnTo(path, returnTo) {
    const safeReturnTo = normalizeAuthReturnTo(returnTo);

    return safeReturnTo
        ? `${path}?returnTo=${encodeURIComponent(safeReturnTo)}`
        : path;
}
