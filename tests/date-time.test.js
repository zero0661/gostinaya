import test from 'node:test';
import assert from 'node:assert/strict';
import { formatMoscowDateTime } from '../utils/dateTime.js';

test('SQLite UTC timestamps are displayed in Moscow time', () => {
    assert.equal(
        formatMoscowDateTime('2026-08-17 10:35:03'),
        '2026-08-17 13:35:03'
    );
});

test('invalid timestamps are preserved instead of throwing', () => {
    assert.equal(formatMoscowDateTime('unknown'), 'unknown');
});
