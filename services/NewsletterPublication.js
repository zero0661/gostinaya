import sanitizeHtml from 'sanitize-html';

function articleExcerpt(post) {
  const source = post.custom_excerpt || post.meta_description || post.excerpt || post.html || '';
  const text = sanitizeHtml(String(source).replace(/<\/?(?:p|div|h[1-6]|li|blockquote|br)\b[^>]*>/gi, ' '), { allowedTags: [], allowedAttributes: {} })
    .replace(/&#(x[0-9a-f]+|[0-9]+);/gi, (entity, code) => {
      const value = code[0].toLowerCase() === 'x' ? parseInt(code.slice(1), 16) : Number(code);
      return value > 0 && value <= 0x10ffff ? String.fromCodePoint(value) : entity;
    })
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ').trim();
  if (text.length <= 500) return text;
  const prefix = text.slice(0, 500);
  const boundary = prefix.lastIndexOf(' ');
  return `${prefix.slice(0, boundary > 350 ? boundary : 500).trimEnd()}…`;
}

function articleImage(value) {
  try {
    const url = new URL(value);
    return ['https:', 'http:'].includes(url.protocol) ? url.href : null;
  } catch { return null; }
}

// Delivery is per published post and does not depend on pairing Lounge discussions.
export function newsletterPublication(post, appUrl = 'https://milenin.pro') {
  if (!post?.id || !post?.title || post.status !== 'published') return null;
  const url = new URL(post.url);
  if (url.origin !== new URL(appUrl).origin) throw new Error('Foreign publication URL');
  const en = url.pathname.startsWith('/en/');
  const legacyDeliveryKeys = (post.tags || [])
    .map(tag => tag.name)
    .filter(name => /^#discussion-[a-z0-9][a-z0-9-]*$/i.test(name))
    .map(name => `discussion:${name.toLowerCase()}`);
  return {
    deliveryKey: `post:${post.id}`, legacyDeliveryKeys,
    title: post.title,
    excerptRu: en ? null : articleExcerpt(post),
    excerptEn: en ? articleExcerpt(post) : null,
    imageRu: en ? null : articleImage(post.feature_image),
    imageEn: en ? articleImage(post.feature_image) : null,
    titleRu: en ? null : post.title,
    titleEn: en ? post.title : null,
    urlRu: en ? null : post.url,
    urlEn: en ? post.url : null
  };
}
