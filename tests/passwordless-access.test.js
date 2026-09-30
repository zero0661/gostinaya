import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import vm from 'node:vm';
import { EmailVerificationService } from '../services/EmailVerificationServiceCore.js';

async function harness() {
  const sqlite = new DatabaseSync(':memory:');
  const schema = await fs.readFile(new URL('../database/init.js', import.meta.url), 'utf8');
  sqlite.exec(schema.match(/db.run\(`([\s\S]*?)`\)/)[1]);
  const db = {
    get(sql, params, callback) {
      try { callback(null, sqlite.prepare(sql).get(...params)); } catch (err) { callback(err); }
    },
    run(sql, params, callback) {
      try {
        const result = sqlite.prepare(sql).run(...params);
        callback.call({ changes: Number(result.changes), lastID: Number(result.lastInsertRowid) }, null);
      } catch (err) { callback(err); }
    }
  };
  const source = (await fs.readFile(new URL('../repositories/GuestRepository.js', import.meta.url), 'utf8'))
    .replace("import db from '../database/db.js';", '')
    .replace('export default new GuestRepository();', 'globalThis.repository = new GuestRepository();');
  const context = vm.createContext({ db });
  vm.runInContext(source, context);
  return { sqlite, guests: context.repository };
}

test('sign-in links work for new and existing members, expire, are single-use, and respect blocks', async () => {
  const { sqlite, guests } = await harness();
  try {
    const guest = await guests.create({ name: 'Nick', email: 'nick@example.com', passwordHash: 'opaque-secret', language: 'ru', country: '', city: '', location: '', joinReason: '', currentTopic: '' });
    let now = 1000;
    const emails = [];
    const service = new EmailVerificationService({ guests, mailer: async message => emails.push(message), appUrl: 'https://milenin.pro', now: () => now, ttlMs: 1000, resendCooldownMs: 100 });
    const issue = async () => {
      await service.issue(await guests.findById(guest.id));
      return new URL(emails.at(-1).text.match(/https:\/\/\S+/)[0]).searchParams.get('token');
    };
    const first = await issue();
    const verified = await service.verify(first);
    assert.equal(verified.name, 'Nick');
    assert.ok(verified.email_verified_at);
    assert.equal(await service.verify(first), null);
    now += 101;
    const second = await issue();
    assert.equal((await service.verify(second)).id, guest.id);
    now += 101;
    const expired = await issue();
    now += 1001;
    assert.equal(await service.verify(expired), null);
    const blocked = await issue();
    sqlite.prepare('UPDATE guests SET is_blocked = 1 WHERE id = ?').run(guest.id);
    assert.equal(await service.verify(blocked), null);
    assert.equal((await service.issue(await guests.findById(guest.id))).sent, false);
    assert.ok(sqlite.prepare('SELECT rules_accepted_at FROM guests WHERE id = ?').get(guest.id).rules_accepted_at);
  } finally { sqlite.close(); }
});
