import crypto from 'crypto';

function createAdminToken() {
  const [id, secret] = (process.env.GHOST_ADMIN_API_KEY || '').split(':');
  if (!id || !secret) throw new Error('GHOST_ADMIN_API_KEY is missing or invalid');
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT', kid: id })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({ iat: now, exp: now + 300, aud: '/admin/' })).toString('base64url');
  const unsigned = `${header}.${payload}`;
  const signature = crypto.createHmac('sha256', Buffer.from(secret, 'hex')).update(unsigned).digest('base64url');
  return `${unsigned}.${signature}`;
}

async function adminFetch(path, options = {}) {
  const response = await fetch(`https://milenin.pro/ghost/api/admin${path}`, {
    ...options,
    headers: { Authorization: `Ghost ${createAdminToken()}`, 'Accept-Version': 'v6.0', ...(options.headers || {}) }
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Ghost Admin API ${response.status}: ${body.slice(0, 300)}`);
  }
  return response.json();
}

function escapeNql(value) { return String(value).replace(/\\/g, '\\\\').replace(/'/g, "\\'"); }

export default {
  async getPostById(postId) {
    const data = await adminFetch(`/posts/${encodeURIComponent(postId)}/?include=tags`);
    return data.posts?.[0] || null;
  },
  async getPostByUrl(url) {
    let parsedUrl;
    try {
      parsedUrl = new URL(url);
    } catch {
      throw new Error(`Invalid article URL: ${url}`);
    }
    const segments = parsedUrl.pathname.split('/').filter(Boolean);
    const slug = segments.at(-1);
    if (!slug) throw new Error(`Article URL has no slug: ${url}`);
    const data = await adminFetch(`/posts/?limit=1&include=tags&filter=${encodeURIComponent(`slug:'${escapeNql(decodeURIComponent(slug))}'`)}`);
    return data.posts?.[0] || null;
  },
  async findPostsByDiscussionTag(tagName) {
    const tagSlug = tagName.startsWith('#') ? `hash-${tagName.slice(1)}` : tagName;
    const data = await adminFetch(`/posts/?limit=all&include=tags&filter=${encodeURIComponent(`tag:${tagSlug}`)}`);
    return data.posts || [];
  },
  async addDiscussionTag(post, tagName) {
    const tags = (post.tags || []).map(tag => ({ name: tag.name }));
    if (!tags.some(tag => tag.name === tagName)) tags.push({ name: tagName });
    const data = await adminFetch(`/posts/${encodeURIComponent(post.id)}/`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ posts: [{ id: post.id, tags }] })
    });
    return data.posts?.[0] || null;
  }
};
