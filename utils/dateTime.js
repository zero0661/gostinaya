const MOSCOW_TIME_ZONE = 'Europe/Moscow';

function parseUtcDate(value) {
    if (value instanceof Date) return value;

    const raw = String(value || '').trim();
    if (!raw) return null;

    const hasTimeZone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(raw);
    const normalized = raw.includes('T')
        ? raw
        : raw.replace(' ', 'T');
    const date = new Date(hasTimeZone ? normalized : `${normalized}Z`);

    return Number.isNaN(date.getTime()) ? null : date;
}

export function formatMoscowDateTime(value) {
    const date = parseUtcDate(value);
    if (!date) return String(value || '');

    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: MOSCOW_TIME_ZONE,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hourCycle: 'h23'
    }).formatToParts(date);
    const values = Object.fromEntries(parts.map(part => [part.type, part.value]));

    return `${values.year}-${values.month}-${values.day} ${values.hour}:${values.minute}:${values.second}`;
}
