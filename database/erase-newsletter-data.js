import dotenv from 'dotenv';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import ledger from '../utils/newsletterErasureLedger.js';
import {eraseNewsletterData} from '../services/NewsletterErasureCore.js';
dotenv.config();
const {default:ghost}=await import('../services/GhostApiService.js');
const index=process.argv.indexOf('--request-file');
if(index<0 || !process.argv[index+1])throw Error('REQUEST_FILE_REQUIRED');
const request=JSON.parse(readFileSync(process.argv[index+1],'utf8'));
const apply=process.argv.includes('--apply');
if(apply && (!request.verifiedAt || !request.requestId))throw Error('VERIFIED_REQUEST_METADATA_REQUIRED');
const directory=path.dirname(fileURLToPath(import.meta.url));
const database=new DatabaseSync(process.env.GOSTINAYA_DB_PATH || path.join(directory,'gostinaya.db'));
const records={
 async count(email) {
  return {
   consents:database.prepare('SELECT COUNT(*) AS n FROM newsletter_consents WHERE email=?').get(email).n,
   tokens:database.prepare("SELECT COUNT(*) AS n FROM newsletter_subscription_tokens WHERE lower(json_extract(payload,'$.email'))=?").get(email).n,
   deliveryAddresses:database.prepare('SELECT COUNT(*) AS n FROM newsletter_deliveries WHERE lower(recipient_email)=?').get(email).n
  };
 },
 async revoke(email) {
  database.prepare('UPDATE newsletter_consents SET revoked_at=COALESCE(revoked_at,?) WHERE email=?').run(new Date().toISOString(),email);
 },
 async erase(email) {
  database.exec('PRAGMA busy_timeout=5000; PRAGMA secure_delete=ON; BEGIN IMMEDIATE');
  try {
   database.prepare("DELETE FROM newsletter_subscription_tokens WHERE lower(json_extract(payload,'$.email'))=?").run(email);
   // Keep anti-duplicate keys; removing delivery rows could resend old articles.
   database.prepare("UPDATE newsletter_deliveries SET recipient_email='', error=NULL, message_id=NULL WHERE lower(recipient_email)=?").run(email);
   database.prepare('DELETE FROM newsletter_consents WHERE email=?').run(email);
   database.exec('COMMIT');
  } catch(error) {database.exec('ROLLBACK');throw error;}
  database.exec('VACUUM');
  const checkpoint=database.prepare('PRAGMA wal_checkpoint(TRUNCATE)').get();
  if(checkpoint.busy)throw Error('ERASURE_CHECKPOINT_BUSY');
 }
};
try {
 const result=await eraseNewsletterData({email:request.email,apply,verifiedRequest:Boolean(request.verifiedAt&&request.requestId),ghost,records,ledger});
 console.log(JSON.stringify(result));
} finally {database.close();}
