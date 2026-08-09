function decodeHtml(value = '') {
    return String(value)
        .replace(/&amp;/g, '&')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>');
}

function cleanArticleTitle(value = '') {
    return String(value)
        .replace(/\s*[|—-]\s*После логина\s*$/i, '')
        .trim();
}

function getMeta(html, property) {
    const escaped = property.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    const patterns = [
        new RegExp(
            `<meta[^>]+(?:property|name)=["']${escaped}["'][^>]+content=["']([^"']*)["'][^>]*>`,
            'i'
        ),
        new RegExp(
            `<meta[^>]+content=["']([^"']*)["'][^>]+(?:property|name)=["']${escaped}["'][^>]*>`,
            'i'
        )
    ];

    for (const pattern of patterns) {
        const match = html.match(pattern);
        if (match) {
            return decodeHtml(match[1].trim());
        }
    }

    return '';
}

async function fetchArticle(url) {
    if (!url) {
        return null;
    }

    const response = await fetch(url, {
        headers: {
            'User-Agent': 'Gostinaya Article Preview/1.0'
        },
        signal: AbortSignal.timeout(5000)
    });

    if (!response.ok) {
        throw new Error(
            `Article metadata request failed: ${response.status} ${url}`
        );
    }

    const html = await response.text();

    return {
        url,
        title: cleanArticleTitle(
            getMeta(html, 'og:title') ||
            getMeta(html, 'twitter:title')
        ),
        excerpt:
            getMeta(html, 'og:description') ||
            getMeta(html, 'description'),
        image:
            getMeta(html, 'og:image') ||
            getMeta(html, 'twitter:image'),
        publishedAt:
            getMeta(html, 'article:published_time') ||
            html.match(/"datePublished"\s*:\s*"([^"]+)"/i)?.[1] ||
            ''
    };
}

export default {
    async getPair(urlRu, urlEn) {
        const [ru, en] = await Promise.all([
            fetchArticle(urlRu),
            fetchArticle(urlEn)
        ]);

        return { ru, en };
    }
};
