import assert from 'node:assert/strict';

import ArticleMetadataService from '../services/ArticleMetadataService.js';

const originalFetch = globalThis.fetch;

globalThis.fetch = async url => ({
    ok: true,
    async text() {
        const title = url.endsWith('/en/')
            ? 'Elon Musk on AI &amp; Humanity&#x27;s Future — После логина'
            : 'Илон Маск об ИИ, Китае и будущем человечества — После логина';

        return `<meta property="og:title" content="${title}">`;
    }
});

try {
    const pair = await ArticleMetadataService.getPair(
        'https://example.com/ru/',
        'https://example.com/en/'
    );

    assert.equal(
        pair.ru.title,
        'Илон Маск об ИИ, Китае и будущем человечества'
    );
    assert.equal(pair.en.title, "Elon Musk on AI & Humanity's Future");

    globalThis.fetch = async url => {
        if (url.endsWith('/missing/')) {
            return { ok: false, status: 404, async text() { return ''; } };
        }
        return {
            ok: true,
            async text() {
                return '<meta property="og:title" content="Существующая статья — После логина">';
            }
        };
    };

    const partialPair = await ArticleMetadataService.getPair(
        'https://example.com/existing/',
        'https://example.com/missing/'
    );
    assert.equal(partialPair.ru.title, 'Существующая статья');
    assert.equal(partialPair.en, null);
    assert.equal(partialPair.errors.length, 1);

    console.log('article-metadata-service.test.js: OK');
} finally {
    globalThis.fetch = originalFetch;
}
