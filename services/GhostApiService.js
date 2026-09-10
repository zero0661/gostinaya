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

function escapeNql(value) { return String(value).replace(/\\/g, '\\\\').replace(/'/g, "\\'"); }

function discussionTags(post) {
  return (post.tags || []).map(tag => tag.name).filter(name => /^#discussion-/i.test(name));
}

export function createGhostApiService({ fetchImpl = fetch, adminBaseUrl = 'https://milenin.pro/ghost/api/admin' } = {}) {
  async function adminFetch(path, options = {}) {
    const response = await fetchImpl(`${adminBaseUrl}${path}`, {
      ...options,
      headers: { Authorization: `Ghost ${createAdminToken()}`, 'Accept-Version': 'v6.0', ...(options.headers || {}) }
    });
    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Ghost Admin API ${response.status}: ${body.slice(0, 300)}`);
    }
    return response.json();
  }

  return {
    async listNewsletters() {
      const data = await adminFetch('/newsletters/?limit=all');
      return data.newsletters || [];
    },
    async findMemberByEmail(email) {
      const normalized = String(email || '').trim().toLowerCase();
      const filter = `email:'${escapeNql(normalized)}'`;
      const data = await adminFetch(`/members/?limit=1&include=newsletters,labels&filter=${encodeURIComponent(filter)}`);
      return data.members?.[0] || null;
    },
    async getMemberById(memberId) {
      const data = await adminFetch(`/members/${encodeURIComponent(memberId)}/?include=newsletters,labels`);
      return data.members?.[0] || null;
    },
    async subscribeMember({ email, newsletterName, labelName }) {
      const newsletters = await this.listNewsletters();
      const newsletter = newsletters.find(item => item.name === newsletterName);
      if (!newsletter) throw new Error(`Ghost newsletter not found: ${newsletterName}`);

      const existing = await this.findMemberByEmail(email);
      const newsletterRefs = new Map((existing?.newsletters || []).map(item => [item.id, { id: item.id }]));
      newsletterRefs.set(newsletter.id, { id: newsletter.id });
      const labelNames = new Set((existing?.labels || []).map(item => item.name).filter(Boolean));
      if (labelName) labelNames.add(labelName);

      const member = {
        email: String(email).trim().toLowerCase(),
        newsletters: [...newsletterRefs.values()],
        labels: [...labelNames].map(name => ({ name }))
      };
      const method = existing ? 'PUT' : 'POST';
      const endpoint = existing ? `/members/${encodeURIComponent(existing.id)}/` : '/members/';
      if (existing) member.id = existing.id;
      const data = await adminFetch(endpoint, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ members: [member] })
      });
      return data.members?.[0] || null;
    },
    async unsubscribeMember({ memberId, email, newsletterName }) {
      const newsletters = await this.listNewsletters();
      const target = newsletters.find(item => item.name === newsletterName);
      if (!target) throw new Error(`Ghost newsletter not found: ${newsletterName}`);
      const existing = await this.getMemberById(memberId);
      if (!existing || String(existing.email).toLowerCase() !== String(email).toLowerCase()) return null;
      const member = {
        id: existing.id,
        email: existing.email,
        newsletters: (existing.newsletters || []).filter(item => item.id !== target.id).map(item => ({ id: item.id })),
        labels: (existing.labels || []).map(item => ({ name: item.name }))
      };
      const data = await adminFetch(`/members/${encodeURIComponent(existing.id)}/`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ members: [member] })
      });
      return data.members?.[0] || null;
    },
    async listNewsletterMembers(newsletterName) {
      const newsletters = await this.listNewsletters();
      const newsletter = newsletters.find(item => item.name === newsletterName);
      if (!newsletter) throw new Error(`Ghost newsletter not found: ${newsletterName}`);
      const data = await adminFetch('/members/?limit=all&include=newsletters,labels');
      return (data.members || []).filter(member =>
        member.subscribed !== false &&
        member.email_suppression?.suppressed !== true &&
        (member.newsletters || []).some(item => item.id === newsletter.id)
      );
    },
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
    // Ghost uses updated_at for collision detection and replaces all tag relations.
    // Always fetch the latest post immediately before writing.
    const latest = await this.getPostById(post.id);
    if (!latest) throw new Error(`Ghost post ${post.id} was not found before update`);

    const existingDiscussionTags = discussionTags(latest);
    if (existingDiscussionTags.includes(tagName)) return latest;
    if (existingDiscussionTags.length) {
      throw new Error(`Ghost post ${post.id} already has a different discussion tag: ${existingDiscussionTags.join(', ')}`);
    }

    const tags = (latest.tags || []).map(tag => {
      if (typeof tag.name !== 'string' || !tag.name.trim()) throw new Error(`Ghost post ${post.id} has a tag without a valid name`);
      return { name: tag.name };
    });
    tags.push({ name: tagName });
    const data = await adminFetch(`/posts/${encodeURIComponent(latest.id)}/`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ posts: [{ id: latest.id, updated_at: latest.updated_at, tags }] })
    });
    return data.posts?.[0] || null;
  }
  };
}

const GhostApiService = createGhostApiService();
export default GhostApiService;
