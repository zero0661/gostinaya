import crypto from 'crypto';

function createAdminToken() {
  const key = process.env.GHOST_ADMIN_API_KEY || '';
  const [id, secret] = key.split(':');

  if (!id || !secret) {
    throw new Error('GHOST_ADMIN_API_KEY is missing or invalid');
  }

  const now = Math.floor(Date.now() / 1000);

  const header = Buffer.from(JSON.stringify({
    alg: 'HS256',
    typ: 'JWT',
    kid: id
  })).toString('base64url');

  const payload = Buffer.from(JSON.stringify({
    iat: now,
    exp: now + 300,
    aud: '/admin/'
  })).toString('base64url');

  const unsigned = `${header}.${payload}`;

  const signature = crypto
    .createHmac('sha256', Buffer.from(secret, 'hex'))
    .update(unsigned)
    .digest('base64url');

  return `${unsigned}.${signature}`;
}

async function adminFetch(path) {
  const token = createAdminToken();

  const response = await fetch(
    `https://milenin.pro/ghost/api/admin${path}`,
    {
      headers: {
        Authorization: `Ghost ${token}`,
        'Accept-Version': 'v6.0'
      }
    }
  );

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Ghost Admin API ${response.status}: ${body.slice(0, 300)}`);
  }

  return response.json();
}

export default {
  async getPostById(postId) {
    const data = await adminFetch(
      `/posts/${encodeURIComponent(postId)}/?include=tags`
    );

    return data.posts?.[0] || null;
  },

  async findPostsByDiscussionTag(tagName) {
    const tagSlug = tagName.startsWith('#')
      ? `hash-${tagName.slice(1)}`
      : tagName;

    const filter = encodeURIComponent(`tag:${tagSlug}`);

    const data = await adminFetch(
      `/posts/?limit=all&include=tags&filter=${filter}`
    );

    return data.posts || [];
  }
};
