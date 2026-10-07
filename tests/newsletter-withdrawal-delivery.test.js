import test from 'node:test';
import assert from 'node:assert/strict';
import { NewsletterDeliveryService } from '../services/NewsletterDeliveryServiceCore.js';

function fixture(canDeliver) {
 const events=[];
 const service=new NewsletterDeliveryService({
  ghost:{async listNewsletterMembers(){return [{id:'member',email:'a@example.invalid'}]}},
  canDeliver,
  deliveries:{async claim(){events.push('claim');return true},async markSent(){events.push('sent')}},
  mailer:async()=>events.push('mail'),
  unsubscribeUrl:async()=>'/unsubscribe'
 });
 return {service,events};
}
const publication={deliveryKey:'test',urlRu:'https://milenin.pro/example/',title:'Test'};
test('recorded withdrawal blocks delivery even if Ghost still lists the address',async()=>{
 const {service,events}=fixture(async()=>false);
 const result=await service.deliverLanguage(publication,'ru');
 assert.deepEqual(result,{language:'ru',sent:0,skipped:1,failed:0});
 assert.deepEqual(events,[]);
});
test('unavailable consent journal prevents delivery rather than sending without a withdrawal check',async()=>{
 const {service,events}=fixture(async()=>{throw Error('DB_FAILURE')});
 await assert.rejects(service.deliverLanguage(publication,'ru'),/DB_FAILURE/);
 assert.deepEqual(events,[]);
});
