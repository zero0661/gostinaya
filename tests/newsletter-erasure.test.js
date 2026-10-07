import test from 'node:test';
import assert from 'node:assert/strict';
import {eraseNewsletterData} from '../services/NewsletterErasureCore.js';
function fixture(failGhost=false) {
 const events=[];
 return {events,args:{email:' A@Example.invalid ',
  records:{async count(){return {consents:2}},async revoke(){events.push('revoke')},async erase(){events.push('erase')}},
  ledger:{async record(){events.push('ledger')}},
  ghost:{async deleteFreeMemberByEmail(){events.push('ghost');if(failGhost)throw Error('GHOST_FAILED')}}
 }};
}
test('erasure preview does not mutate either store',async()=>{
 const {events,args}=fixture();
 assert.deepEqual(await eraseNewsletterData(args),{applied:false,plan:{consents:2}});
 assert.deepEqual(events,[]);
});
test('erasure requires a verified request before changing data',async()=>{
 const {events,args}=fixture();
 await assert.rejects(eraseNewsletterData({...args,apply:true}),/VERIFIED_REQUEST_REQUIRED/);
 assert.deepEqual(events,[]);
});
test('failed Ghost deletion preserves revocation and restore ledger; local evidence is not erased',async()=>{
 const {events,args}=fixture(true);
 await assert.rejects(eraseNewsletterData({...args,apply:true,verifiedRequest:true}),/GHOST_FAILED/);
 assert.deepEqual(events,['ledger','revoke','ghost']);
});
test('successful erasure removes local data only after Ghost verification',async()=>{
 const {events,args}=fixture();
 await eraseNewsletterData({...args,apply:true,verifiedRequest:true});
 assert.deepEqual(events,['ledger','revoke','ghost','erase']);
});
