import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,rmSync,unlinkSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';

test('hashed ledger blocks restored addresses, permits a later confirmation and fails closed without its key',async()=>{
 const dir=mkdtempSync(path.join(os.tmpdir(),'newsletter-ledger-'));
 const previous=process.env.NEWSLETTER_ERASURE_LEDGER_DIR;
 process.env.NEWSLETTER_ERASURE_LEDGER_DIR=dir;
 try {
  const {default:ledger}=await import('../utils/newsletterErasureLedger.js?isolated='+Date.now());
  assert.equal(await ledger.blocks('a@example.invalid'),false);
  await ledger.record(' A@Example.invalid ');
  const text=readFileSync(path.join(dir,'erasures.jsonl'),'utf8');
  assert.ok(!text.toLowerCase().includes('a@example.invalid'));
  assert.equal(await ledger.blocks('a@example.invalid'),true);
  assert.equal(await ledger.blocks('a@example.invalid','2000-01-01T00:00:00.000Z'),true);
  assert.equal(await ledger.blocks('a@example.invalid',new Date(Date.now()+1000).toISOString()),false);
  assert.equal(await ledger.blocks('other@example.invalid'),false);
  unlinkSync(path.join(dir,'ledger.key'));
  await assert.rejects(ledger.blocks('a@example.invalid'));
 } finally {
  if(previous===undefined)delete process.env.NEWSLETTER_ERASURE_LEDGER_DIR;else process.env.NEWSLETTER_ERASURE_LEDGER_DIR=previous;
  rmSync(dir,{recursive:true,force:true});
 }
});
