import test from 'node:test';
import assert from 'node:assert/strict';
import { createWebhookQueue } from '../services/WebhookQueue.js';

test('serializes concurrent webhook deliveries', async () => {
  let active = 0;
  let maxActive = 0;
  const order = [];
  const enqueue = createWebhookQueue(async value => {
    active += 1;
    maxActive = Math.max(maxActive, active);
    order.push(`start-${value}`);
    await new Promise(resolve => setTimeout(resolve, 5));
    order.push(`end-${value}`);
    active -= 1;
    return value;
  });

  assert.deepEqual(await Promise.all([enqueue(1), enqueue(2)]), [1, 2]);
  assert.equal(maxActive, 1);
  assert.deepEqual(order, ['start-1', 'end-1', 'start-2', 'end-2']);
});

test('continues processing after a failed webhook', async () => {
  const enqueue = createWebhookQueue(async value => {
    if (value === 'bad') throw new Error('bad delivery');
    return value;
  });

  await assert.rejects(enqueue('bad'), /bad delivery/);
  assert.equal(await enqueue('good'), 'good');
});
