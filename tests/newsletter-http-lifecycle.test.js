import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer as httpServer} from 'node:http';
import {createServer as tcpServer} from 'node:net';
import {spawn,spawnSync} from 'node:child_process';
import {mkdtempSync,rmSync} from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {DatabaseSync} from 'node:sqlite';
const listen=server=>new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const close=server=>new Promise(resolve=>server.close(resolve));

for (const language of ['ru','en']) test(language+' HTTP signup, confirmation and unsubscribe persist consent; all mail stays in a local SMTP sink', {timeout:30000}, async()=>{
 const dir=mkdtempSync(path.join(os.tmpdir(),'newsletter-http-')),dbPath=path.join(dir,'test.db');
 const messages=[];let member=null,child;
 const smtp=tcpServer(socket=>{
  socket.write('220 local test SMTP\r\n');let buffer='',data=false,lines=[];
  socket.on('data',chunk=>{
   buffer+=chunk.toString();
   while(buffer.includes('\r\n')){
    const i=buffer.indexOf('\r\n'),line=buffer.slice(0,i);buffer=buffer.slice(i+2);
    if(data){if(line==='.') {messages.push(lines.join('\r\n'));lines=[];data=false;socket.write('250 accepted\r\n');}else lines.push(line);continue;}
    if(/^EHLO/i.test(line))socket.write('250-localhost\r\n250 AUTH PLAIN\r\n');
    else if(/^AUTH/i.test(line))socket.write('235 authenticated\r\n');
    else if(/^DATA/i.test(line)){data=true;socket.write('354 send data\r\n');}
    else if(/^QUIT/i.test(line)){socket.end('221 bye\r\n');}
    else socket.write('250 OK\r\n');
   }
  });
 });
 const ghost=httpServer(async(req,res)=>{
  let body='';for await(const chunk of req)body+=chunk;
  const url=new URL(req.url,'http://localhost');
  res.setHeader('Content-Type','application/json');
  if(url.pathname.includes('/newsletters/'))return res.end(JSON.stringify({newsletters:[{id:'ru',name:'После логина — RU'},{id:'en',name:'After Login — EN'}],meta:{pagination:{next:null}}}));
  if(req.method==='POST'||req.method==='PUT')member={id:'member',status:'free',...JSON.parse(body).members[0]};
  res.end(JSON.stringify({members:member?[member]:[],meta:{pagination:{next:null}}}));
 });
 const portProbe=tcpServer();let output='';
 try {
  for(const file of ['migrate-newsletter-deliveries.js','migrate-newsletter-consents.js']){
   const result=spawnSync(process.execPath,['database/'+file,'--apply'],{env:{...process.env,GOSTINAYA_DB_PATH:dbPath},encoding:'utf8'});
   assert.equal(result.status,0,result.stderr);
  }
  await listen(smtp);await listen(ghost);await listen(portProbe);
  const port=portProbe.address().port;await close(portProbe);
  const base='http://127.0.0.1:'+port;
  child=spawn(process.execPath,['app.js'],{env:{...process.env,PORT:String(port),APP_URL:base,GOSTINAYA_DB_PATH:dbPath,SESSION_SECRET:'test-session-secret',GHOST_ADMIN_API_URL:'http://127.0.0.1:'+ghost.address().port+'/ghost/api/admin',GHOST_ADMIN_API_KEY:'test:'+('ab'.repeat(32)),NEWSLETTER_SMTP_HOST:'127.0.0.1',NEWSLETTER_SMTP_PORT:String(smtp.address().port),NEWSLETTER_SMTP_SECURE:'false',NEWSLETTER_SMTP_USER:'test',NEWSLETTER_SMTP_PASS:'test',NEWSLETTER_MAIL_FROM:'test@example.invalid',NEWSLETTER_ERASURE_LEDGER_DIR:path.join(dir,'ledger')}});
  child.stdout.on('data',d=>output+=d);child.stderr.on('data',d=>output+=d);
  for(let i=0;i<50;i++){try{const response=await fetch(base+'/health');if(response.ok)break;}catch{}await new Promise(resolve=>setTimeout(resolve,100));}
  const endpoint=base+'/gostinaya/api/newsletter/subscribe';
  const send=body=>fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  const missing=await send({email:'reader@example.invalid'});
  assert.equal(missing.status,400);assert.equal(messages.length,0);
  const signup=await send({email:'reader@example.invalid',language,consent:true,consentVersion:'newsletter-2026-10-08-beget-v1'});
  assert.equal(signup.status,202,await signup.text());assert.equal(messages.length,1);assert.equal(member,null);
  const decode=text=>text.split(/\r\n--[^\r\n]+\r\n/).map(part=>{
   const separator=part.indexOf('\r\n\r\n');
   const headers=part.slice(0,separator),body=part.slice(separator+4).split(/\r\n--/)[0];
   if(/Content-Type:\s*text\//i.test(headers) && /Content-Transfer-Encoding:\s*base64/i.test(headers)) return Buffer.from(body.replace(/\s/g,''),'base64').toString('utf8');
   return part.replace(/=\r?\n/g,'').replace(/=3D/g,'=');
  }).join('\n');
  const confirm=decode(messages[0]).match(/http:\/\/127\.0\.0\.1:\d+\/gostinaya\/newsletter\/confirm\?token=[a-f0-9]{64}/)[0];
  const confirmed=await fetch(confirm,{redirect:'manual'});
  assert.equal(confirmed.status,303,output);assert.equal(messages.length,2);assert.equal(member.newsletters[0].id,language);
  const unsubscribe=decode(messages[1]).match(/http:\/\/127\.0\.0\.1:\d+\/gostinaya\/newsletter\/unsubscribe\?token=[a-f0-9]{64}/)[0];
  const preview=await fetch(unsubscribe);assert.equal(preview.status,200);assert.equal(member.newsletters.length,1);
  const cancelled=await fetch(base+'/gostinaya/newsletter/unsubscribe',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({token:new URL(unsubscribe).searchParams.get('token')})});
  assert.equal(cancelled.status,200);assert.equal(member.newsletters.length,0);assert.equal(messages.length,3);
  const db=new DatabaseSync(dbPath);const row=db.prepare('SELECT * FROM newsletter_consents').get();
  assert.equal(row.document_version,'newsletter-2026-10-08-beget-v1');assert.equal(row.language,language);assert.ok(row.confirmed_at);assert.ok(row.revoked_at);db.close();
 } finally {
  if(child){child.kill('SIGTERM');await new Promise(resolve=>child.once('close',resolve));}
  if(smtp.listening)await close(smtp);if(ghost.listening)await close(ghost);if(portProbe.listening)await close(portProbe);
  rmSync(dir,{recursive:true,force:true});
 }
});
