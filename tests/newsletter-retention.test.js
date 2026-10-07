import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';

test('cleanup dry run preserves data; apply removes expired requests but retains active consent and withdrawals', () => {
 const dir=mkdtempSync(path.join(os.tmpdir(),'newsletter-retention-'));
 const databasePath=path.join(dir,'test.db');
 const run=(script,...args)=>{
  const result=spawnSync(process.execPath,[script,...args],{env:{...process.env,GOSTINAYA_DB_PATH:databasePath},encoding:'utf8'});
  assert.equal(result.status,0,result.stdout+result.stderr);
 };
 try {
  run('database/migrate-newsletter-deliveries.js','--apply');
  run('database/migrate-newsletter-consents.js','--apply');
  run('database/migrate-newsletter-consents.js','--apply');
  const db=new DatabaseSync(databasePath);
  const old='2000-01-01T00:00:00.000Z', fresh=new Date().toISOString();
  const insert=db.prepare('INSERT INTO newsletter_consents (id,email,language,document_version,accepted_at,confirmed_at,revoked_at) VALUES (?,?,?,?,?,?,?)');
  insert.run('old-request','old@example.invalid','ru','v',old,null,null);
  insert.run('fresh-request','fresh@example.invalid','ru','v',fresh,null,null);
  insert.run('active','active@example.invalid','ru','v',old,old,null);
  insert.run('withdrawn','withdrawn@example.invalid','ru','v',old,old,old);
  db.prepare('INSERT INTO newsletter_subscription_tokens (token_hash,action,payload,expires_at) VALUES (?,?,?,?)').run('expired','confirm','{}',1);
  db.prepare('INSERT INTO newsletter_subscription_tokens (token_hash,action,payload,expires_at) VALUES (?,?,?,?)').run('valid','confirm','{}',Date.now()+86400000);
  run('database/cleanup-newsletter-consents.js');
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM newsletter_consents').get().n,4);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM newsletter_subscription_tokens').get().n,2);
  run('database/cleanup-newsletter-consents.js','--apply');
  assert.deepEqual(db.prepare('SELECT id FROM newsletter_consents ORDER BY id').all().map(r=>r.id),['active','fresh-request','withdrawn']);
  assert.deepEqual(db.prepare('SELECT token_hash FROM newsletter_subscription_tokens').all().map(r=>r.token_hash),['valid']);
  assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
  db.close();
 } finally {rmSync(dir,{recursive:true,force:true});}
});
