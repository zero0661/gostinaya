import {createHmac,randomBytes} from 'node:crypto';
import {mkdirSync,existsSync,readFileSync,writeFileSync,openSync,fsyncSync,closeSync} from 'node:fs';
import path from 'node:path';
const directory=process.env.NEWSLETTER_ERASURE_LEDGER_DIR || '/var/lib/afterlogin/privacy';
const keyPath=path.join(directory,'ledger.key'), ledgerPath=path.join(directory,'erasures.jsonl');
function key(create=false) {
 if(create) {
  mkdirSync(directory,{recursive:true,mode:0o700});
  if(!existsSync(keyPath)) {
   try {writeFileSync(keyPath,randomBytes(32),{mode:0o600,flag:'wx'});}
   catch(error){if(error.code!=='EEXIST')throw error;}
  }
 }
 const value=readFileSync(keyPath);
 if(value.length!==32)throw Error('INVALID_ERASURE_LEDGER_KEY');
 return value;
}
function hash(email,secret) {
 return createHmac('sha256',secret).update(String(email).trim().toLowerCase()).digest('hex');
}
export default {
 async record(email) {
  const row={emailHash:hash(email,key(true)),requestedAt:new Date().toISOString()};
  const fd=openSync(ledgerPath,'a',0o600);
  try {writeFileSync(fd,JSON.stringify(row)+'\n');fsyncSync(fd);}
  finally {closeSync(fd);}
 },
 async blocks(email,latestConfirmedAt=null) {
  if(!existsSync(ledgerPath))return false;
  const digest=hash(email,key());
  const rows=readFileSync(ledgerPath,'utf8').split('\n').filter(Boolean).map(line=>JSON.parse(line));
  const requests=rows.filter(row=>row.emailHash===digest).map(row=>row.requestedAt).sort();
  const latest=requests.at(-1);
  return Boolean(latest && (!latestConfirmedAt || latestConfirmedAt<=latest));
 }
};
