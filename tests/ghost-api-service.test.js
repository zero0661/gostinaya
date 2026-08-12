import assert from 'node:assert/strict';
import { createGhostApiService } from '../services/GhostApiService.js';

process.env.GHOST_ADMIN_API_KEY = `test-id:${'ab'.repeat(32)}`;

function response(data, { ok = true, status = 200 } = {}) {
  return {
    ok,
    status,
    async json() { return data; },
    async text() { return JSON.stringify(data); }
  };
}

const requests = [];
const freshPost = {
  id: 'post-1',
  updated_at: '2026-08-12T07:00:00.000Z',
  tags: [{ name: 'Technology' }, { name: '#internal' }]
};
const fetchImpl = async (url, options = {}) => {
  requests.push({ url, options });
  if (!options.method) return response({ posts: [freshPost] });
  const payload = JSON.parse(options.body);
  return response({ posts: [{ ...freshPost, tags: payload.posts[0].tags }] });
};
const service = createGhostApiService({ fetchImpl, adminBaseUrl: 'https://ghost.test/admin' });

const updated = await service.addDiscussionTag({ id: 'post-1' }, '#discussion-pair');
assert.equal(requests.length, 2);
const payload = JSON.parse(requests[1].options.body);
assert.deepEqual(payload, { posts: [{
  id: 'post-1',
  updated_at: freshPost.updated_at,
  tags: [{ name: 'Technology' }, { name: '#internal' }, { name: '#discussion-pair' }]
}] });
assert.equal(updated.tags.at(-1).name, '#discussion-pair');

requests.length = 0;
freshPost.tags.push({ name: '#discussion-pair' });
const unchanged = await service.addDiscussionTag({ id: 'post-1' }, '#discussion-pair');
assert.equal(requests.length, 1, 'an existing discussion tag must not trigger PUT');
assert.equal(unchanged.updated_at, freshPost.updated_at);

requests.length = 0;
freshPost.tags = [{ id: 'broken-tag' }];
await assert.rejects(
  service.addDiscussionTag({ id: 'post-1' }, '#discussion-pair'),
  /tag without a valid name/
);
assert.equal(requests.length, 1, 'invalid existing tags must stop before PUT');

console.log('ghost-api-service: passed');
