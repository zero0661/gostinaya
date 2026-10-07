import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawn,spawnSync} from 'node:child_process';
import {createServer} from 'node:http';
import {DatabaseSync} from 'node:sqlite';

test('erasure CLI removes only the requested address in SQLite and mock Ghost, preserving delivery deduplication',async()=>{
 const dir=mkdtempSync(path.join(os.tmpdir(),'newsletter-erasure-integration-'));
 const dbPath=path.join(dir,'test.db'), ledgerDir=path.join(dir,'ledger');
 const email='erase-me@example.invalid', other='keep-me@example.invalid';
 let present=true;
 const server=createServer((req,res)=>{
  if(req.method==='DELETE'){present=false;res.writeHead(204);return res.end();}
  res.setHeader('Content-Type','application/json');
  res.end(JSON.stringify({members:present?[{id:'target',email,status:'free'}]:[]}));
 });
 try {
  for(const script of ['migrate-newsletter-deliveries.js','migrate-newsletter-consents.js']){
   const result=spawnSync(process.execPath,['database/'+script,'--apply'],{env:{...process.env,GOSTINAYA_DB_PATH:dbPath},encoding:'utf8'});
   assert.equal(result.status,0,result.stderr);
  }
  const db=new DatabaseSync(dbPath);
  const insert=db.prepare('INSERT INTO newsletter_consents (id,email,language,document_version,accepted_at,confirmed_at) VALUES (?,?,?,?,?,?)');
  insert.run('target',email,'ru','v','2026-01-01','2026-01-01');
  insert.run('other',other,'ru','v','2026-01-01','2026-01-01');
  db.prepare('INSERT INTO newsletter_subscription_tokens (token_hash,action,payload,expires_at) VALUES (?,?,?,?)').run('target','confirm',JSON.stringify({email}),Date.now()+86400000);
  db.prepare('INSERT INTO newsletter_subscription_tokens (token_hash,action,payload,expires_at) VALUES (?,?,?,?)').run('other','confirm',JSON.stringify({email:other}),Date.now()+86400000);
  db.prepare("INSERT INTO newsletter_deliveries (delivery_key,newsletter_slug,member_id,recipient_email,status,error,message_id) VALUES (?,?,?,?,?,?,?)").run('article','ru','target',email,'sent','example error','message');
  db.close();
  const requestFile=path.join(dir,'request.json');
  writeFileSync(requestFile,JSON.stringify({email,requestId:'test-request',verifiedAt:new Date().toISOString()}),{mode:0o600});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const env={...process.env,GOSTINAYA_DB_PATH:dbPath,NEWSLETTER_ERASURE_LEDGER_DIR:ledgerDir,GHOST_ADMIN_API_KEY:'test:'+('ab'.repeat(32)),GHOST_ADMIN_API_URL:'http://127.0.0.1:'+server.address().port+'/ghost/api/admin'};
  const run=async(apply)=>{
   const args=['database/erase-newsletter-data.js','--request-file',requestFile];if(apply)args.push('--apply');
   const child=spawn(process.execPath,args,{env});
   let output='';child.stdout.on('data',d=>output+=d);child.stderr.on('data',d=>output+=d);
   const code=await new Promise((resolve,reject)=>{child.on('error',reject);child.on('close',resolve)});
   assert.equal(code,0,output);
  };
  await run(false);assert.equal(present,true);
  await run(true);assert.equal(present,false);
  const after=new DatabaseSync(dbPath);
  assert.deepEqual(after.prepare('SELECT email FROM newsletter_consents').all().map(r=>r.email),[other]);
  assert.deepEqual(after.prepare('SELECT token_hash FROM newsletter_subscription_tokens').all().map(r=>r.token_hash),['other']);
  const delivery=after.prepare('SELECT * FROM newsletter_deliveries').get();
  assert.equal(delivery.delivery_key,'article');assert.equal(delivery.status,'sent');
  assert.equal(delivery.recipient_email,'');assert.equal(delivery.error,null);assert.equal(delivery.message_id,null);
  assert.equal(after.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
  after.close();
  assert.equal(readFileSync(dbPath).includes(Buffer.from(email)),false);
  assert.equal(readFileSync(path.join(ledgerDir,'erasures.jsonl'),'utf8').includes(email),false);
  await run(true);
 } finally {
  if(server.listening)await new Promise(resolve=>server.close(resolve));
  rmSync(dir,{recursive:true,force:true});
 }
});
