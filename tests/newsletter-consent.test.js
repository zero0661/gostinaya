import test from 'node:test';
import assert from 'node:assert/strict';
import { NewsletterSignupService } from '../services/NewsletterSignupServiceCore.js';
import { NEWSLETTER_CONSENT_VERSION } from '../utils/newsletterConsent.js';
function fixture(failStorage = false) {
 const events = [], rows = new Map();
 const service = new NewsletterSignupService({ now: () => 1700000000000,
  consents: { async record(row) { if(failStorage) throw Error('DB_FAILURE'); events.push(['consent', row]); }, async markConfirmed(id, at) { events.push(['confirmed',id,at]); } },
  ghost: { async isMemberSubscribed() { events.push(['lookup']); return false; }, async subscribeMember() { events.push(['subscribe']); return {id:'member'}; } },
  mailer: async mail => events.push(['mail',mail]),
  tokens: { async create(row) {rows.set(row.tokenHash,row)}, async findValid(hash, action, now) {let r=rows.get(hash); return r?.action===action && r.expiresAt>now?r.payload:null}, async consume(hash) {let r=rows.get(hash);rows.delete(hash);return r?.payload}, async remove(hash){rows.delete(hash)} }
 });return {service,events};
}
test('missing, false, string or obsolete consent rejects before lookup, storage or email', async()=>{
 for(const extra of [{},{consent:false},{consent:'true'},{consent:true,consentVersion:'old'}]) {
  const {service,events}=fixture();
  await assert.rejects(service.issue({email:'a@example.com',consentVersion:NEWSLETTER_CONSENT_VERSION,...extra}),/CONSENT_REQUIRED/);
  assert.deepEqual(events,[]);
 }
});
test('failed consent storage stops subscription and email',async()=>{
 const {service,events}=fixture(true);
 await assert.rejects(service.issue({email:'a@example.com',consent:true,consentVersion:NEWSLETTER_CONSENT_VERSION}),/DB_FAILURE/);
 assert.deepEqual(events,[]);
});
test('version and server timestamp persist before delivery, confirmation is linked to same record',async()=>{
 const {service,events}=fixture();
 await service.issue({email:' A@Example.com ',language:'ru',consent:true,consentVersion:NEWSLETTER_CONSENT_VERSION});
 assert.equal(events[0][0],'consent'); let record=events[0][1];
 assert.equal(record.email,'a@example.com'); assert.equal(record.version,NEWSLETTER_CONSENT_VERSION);assert.equal(record.acceptedAt,'2023-11-14T22:13:20.000Z');
 const mail=events.find(e=>e[0]==='mail')[1];const token=new URL(mail.text.match(/https:\/\/\S+/)[0]).searchParams.get('token');
 await service.confirm(token);
 assert.deepEqual(events.find(e=>e[0]==='confirmed'),['confirmed',record.id,record.acceptedAt]);
 assert.equal(await service.confirm(token),null);
});
