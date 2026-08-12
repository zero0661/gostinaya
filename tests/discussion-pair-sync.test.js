import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPairPlans, syncPairs } from '../scripts/sync-article-discussion-pairs.js';

test('preflight finishes before writes and a rerun skips existing tags', async () => {
  const pairs = [
    { ruUrl: 'https://example.test/ru-one/', enUrl: 'https://example.test/en/one/' },
    { ruUrl: 'https://example.test/ru-two/', enUrl: 'https://example.test/en/two/' }
  ];
  const posts = new Map([
    [pairs[0].ruUrl, { id: 'ru-1', tags: [{ name: '#discussion-existing' }] }],
    [pairs[0].enUrl, { id: 'en-1', tags: [] }],
    [pairs[1].ruUrl, { id: 'ru-2', tags: [] }],
    [pairs[1].enUrl, { id: 'en-2', tags: [] }]
  ]);
  const events = [];
  const ghost = {
    async getPostByUrl(url) { events.push(`read:${url}`); return posts.get(url); },
    async addDiscussionTag(post, tag) {
      events.push(`write:${post.id}`);
      if (!(post.tags || []).some(item => item.name === tag)) post.tags = [...(post.tags || []), { name: tag }];
      return post;
    }
  };
  const webhook = { async handlePost() { return { topicId: 21, merged: false }; } };

  await syncPairs({ pairs, apply: true, ghost, webhook, log() {} });
  assert.equal(events.slice(0, 4).every(event => event.startsWith('read:')), true);
  assert.deepEqual(posts.get(pairs[0].enUrl).tags, [{ name: '#discussion-existing' }]);
});

test('preflight rejects the same discussion tag across two different pairs', async () => {
  const pairs = [
    { ruUrl: 'https://example.test/a/', enUrl: 'https://example.test/en/a/' },
    { ruUrl: 'https://example.test/b/', enUrl: 'https://example.test/en/b/' }
  ];
  const ghost = {
    async getPostByUrl(url) { return { id: url, tags: [{ name: '#discussion-duplicate' }] }; }
  };
  await assert.rejects(buildPairPlans(pairs, ghost), /shared by pairs 1 and 2/);
});
