import test from 'node:test';
import assert from 'node:assert/strict';
import { createGhostApiService } from '../services/GhostApiService.js';

process.env.GHOST_ADMIN_API_KEY = `test-id:${'ab'.repeat(32)}`;

function response(data) {
  return { ok: true, status: 200, async json() { return data; }, async text() { return JSON.stringify(data); } };
}

test('member subscription updates preserve other newsletters and labels', async () => {
  const writes = [];
  const newsletters = [
    { id: 'ru-id', name: 'После логина — RU' },
    { id: 'en-id', name: 'After Login — EN' }
  ];
  const existing = {
    id: 'member-1', email: 'reader@example.com', subscribed: true,
    newsletters: [{ id: 'en-id', name: 'After Login — EN' }],
    labels: [{ name: 'Existing', slug: 'existing' }]
  };
  const fetchImpl = async (url, options = {}) => {
    if (url.includes('/newsletters/')) return response({ newsletters });
    if (options.method === 'PUT') {
      const member = JSON.parse(options.body).members[0];
      writes.push(member);
      return response({ members: [member] });
    }
    return response({ members: [existing] });
  };
  const service = createGhostApiService({ fetchImpl, adminBaseUrl: 'https://ghost.test/admin' });
  await service.subscribeMember({
    email: 'reader@example.com', newsletterName: 'После логина — RU', labelName: 'После логина RU'
  });
  assert.deepEqual(writes[0].newsletters, [{ id: 'en-id' }, { id: 'ru-id' }]);
  assert.deepEqual(writes[0].labels, [{ name: 'Existing' }, { name: 'После логина RU' }]);

  await service.unsubscribeMember({
    memberId: 'member-1', email: 'reader@example.com', newsletterName: 'После логина — RU'
  });
  assert.deepEqual(writes[1].newsletters, [{ id: 'en-id' }], 'unsubscribing from RU must preserve EN');
});

test('delivery recipients exclude unsubscribed and suppressed members', async () => {
  const newsletters = [{ id: 'ru-id', name: 'После логина — RU' }];
  const members = [
    { id: 'ok', subscribed: true, newsletters: [{ id: 'ru-id' }] },
    { id: 'wrong', subscribed: true, newsletters: [] },
    { id: 'off', subscribed: false, newsletters: [{ id: 'ru-id' }] },
    { id: 'suppressed', subscribed: true, email_suppression: { suppressed: true }, newsletters: [{ id: 'ru-id' }] }
  ];
  const fetchImpl = async url => url.includes('/newsletters/')
    ? response({ newsletters })
    : response({ members });
  const service = createGhostApiService({ fetchImpl, adminBaseUrl: 'https://ghost.test/admin' });
  assert.deepEqual((await service.listNewsletterMembers('После логина — RU')).map(item => item.id), ['ok']);
});

test('existing newsletter membership is detected without changing the member', async () => {
  const newsletters = [{ id: 'en-id', name: 'After Login — EN' }];
  const member = {
    id: 'member-1', email: 'reader@example.com', subscribed: true,
    newsletters: [{ id: 'en-id', name: 'After Login — EN' }], labels: []
  };
  const fetchImpl = async url => url.includes('/newsletters/')
    ? response({ newsletters })
    : response({ members: [member] });
  const service = createGhostApiService({ fetchImpl, adminBaseUrl: 'https://ghost.test/admin' });
  assert.equal(await service.isMemberSubscribed({
    email: 'reader@example.com', newsletterName: 'After Login — EN'
  }), true);
});
