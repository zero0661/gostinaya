export function createWebhookQueue(handler) {
  let queue = Promise.resolve();

  return payload => {
    const result = queue.then(() => handler(payload));

    // A rejected webhook must not poison the queue for every later delivery.
    queue = result.catch(() => undefined);
    return result;
  };
}
