import test from 'node:test';
import assert from 'node:assert/strict';
import { createArticleDiscussionListService } from '../services/ArticleDiscussionListServiceCore.js';

test('repairs existing partial pairs, reloads after merge, coalesces concurrent lists', async () => {
  let rows = [{ topic_id: 1, ghost_post_id_ru: 'ru', url_ru: '/ru' }, { topic_id: 2, ghost_post_id_en: 'en', url_en: '/en' }];
  let calls = 0;
  const service = createArticleDiscussionListService({ repository: { list: async () => rows }, synchronizer: { syncPostById: async () => { calls++; rows = [{ topic_id: 1, ghost_post_id_ru: 'ru', ghost_post_id_en: 'en', url_ru: '/ru', url_en: '/en' }]; } } });
  const [first, second] = await Promise.all([service.list(), service.list()]);
  assert.equal(first.length, 1);
  assert.equal(second[0].ghost_post_id_en, 'en');
  const previous = calls;
  await service.list();
  assert.equal(calls, previous);
});

test('throttles legacy posts, retries after cooldown, tolerates Ghost outage', async () => {
  let time = 0;
  let calls = 0;
  const rows = [{ ghost_post_id_ru: 'ru', url_ru: '/ru' }];
  const service = createArticleDiscussionListService({ repository: { list: async () => rows }, synchronizer: { syncPostById: async () => { calls++; throw Error('offline'); } }, now: () => time, log: () => {} });
  assert.deepEqual(await service.list(), rows);
  await service.list();
  assert.equal(calls, 1);
  time = 60000;
  await service.list();
  assert.equal(calls, 2);
});
