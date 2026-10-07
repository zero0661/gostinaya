import test from 'node:test';
import assert from 'node:assert/strict';
import {createGhostApiService} from '../services/GhostApiService.js';

test('Ghost member erasure handles 204 and verifies absence; paid members are protected',async()=>{
 const previous=process.env.GHOST_ADMIN_API_KEY;
 process.env.GHOST_ADMIN_API_KEY='test:'+('ab'.repeat(32));
 try {
  let present=true;const calls=[];
  const api=createGhostApiService({fetchImpl:async(url,options)=>{
   calls.push(options.method||'GET');
   if(options.method==='DELETE'){present=false;return new Response(null,{status:204})}
   return Response.json({members:present?[{id:'member',email:'a@example.invalid',status:'free'}]:[]});
  }});
  assert.deepEqual(await api.deleteFreeMemberByEmail('a@example.invalid'),{deleted:true,absent:true});
  assert.deepEqual(calls,['GET','DELETE','GET']);
  assert.deepEqual(await api.deleteFreeMemberByEmail('a@example.invalid'),{deleted:false,absent:true});
  const paidCalls=[];
  const paid=createGhostApiService({fetchImpl:async(url,options)=>{
   paidCalls.push(options.method||'GET');
   return Response.json({members:[{id:'paid',status:'paid'}]});
  }});
  await assert.rejects(paid.deleteFreeMemberByEmail('a@example.invalid'),/PAID_MEMBER_REQUIRES_MANUAL_REVIEW/);
  assert.deepEqual(paidCalls,['GET']);
 } finally {
  if(previous===undefined)delete process.env.GHOST_ADMIN_API_KEY;else process.env.GHOST_ADMIN_API_KEY=previous;
 }
});
