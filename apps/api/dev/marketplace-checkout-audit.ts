// Run from apps/api: npx tsx dev/marketplace-checkout-audit.ts
// CHECKOUT_AUDIT_REDIS_URL must identify a dedicated disposable Redis instance/database.
// startApi creates/migrates an isolated PostgreSQL database. No target URL is accepted.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHmac, randomUUID} from 'node:crypto';
import postgres from 'postgres';
import {startApi} from '../tests/support/api.js';

const address={fullName:'Synthetic load buyer',phone:'09120000000',province:'Tehran',city:'Tehran',addressLine1:'Synthetic test street',postalCode:'1234567890'};
const percentile=(values:number[],fraction:number)=>{const sorted=[...values].sort((a,b)=>a-b);return sorted[Math.max(0,Math.ceil(sorted.length*fraction)-1)]??null;};
async function main(){
  assert.ok(process.env.CHECKOUT_AUDIT_REDIS_URL,'Set CHECKOUT_AUDIT_REDIS_URL to dedicated disposable Redis; shared REDIS_URL is not accepted implicitly.');
  process.env.REDIS_URL=process.env.CHECKOUT_AUDIT_REDIS_URL;
  process.env.API_RATE_LIMIT_MAX='1000000';
  const reportPath=path.resolve(process.env.MARKETPLACE_CHECKOUT_REPORT??'../../.deploy/marketplace/checkout-load-report.json');
  const report:any={started:new Date().toISOString(),scenario:'LOAD-02',transport:'real HTTP over loopback',topology:{owners:1,stores:20,distinctBuyers:120,distinctSkus:120},notes:['Synthetic verified buyers; one owner across 20 stores. Not 20 independent sellers.','20 then 100 simultaneous distinct buyer journeys, one distinct SKU per buyer; store locks remain shared.','Isolated PostgreSQL via startApi; explicit dedicated Redis; mock payments only; process-local global IP limit raised.','No fixed arrival rate, soak, real provider, or production capacity claim.'],profiles:[],completed:false};
  const save=()=>{fs.mkdirSync(path.dirname(reportPath),{recursive:true});fs.writeFileSync(reportPath,JSON.stringify(report,null,2));};
  const api=await startApi();api.app.log.level='silent';
  const q=postgres(process.env.DATABASE_URL!,{max:2});
  try{
    const owner=await api.register('checkout-load-owner');
    const [seller]=await q`insert into seller_profiles(user_id,display_name,status) values(${owner.userId},'Synthetic load owner','ACTIVE') returning id`;
    const stores=await q`insert into stores(seller_profile_id,slug,name,description,category,status,risk_cap_rial) select ${seller!.id},'checkout-load-'||n,'Synthetic store '||n,'Disposable load fixture','dice','ACTIVE',1000000000 from generate_series(1,20)n returning id`;
    await q`insert into store_members(store_id,user_id,role) select id,${owner.userId},'OWNER' from stores`;
    await q`insert into marketplace_shipping_profiles(store_id,method,fee_rial,dispatch_days) select id,'Synthetic carrier',30000,3 from stores`;
    const fixtures=[];
    for(let i=0;i<120;i++){
      const buyer=await api.register('checkout-load-buyer');
      await q`update users set email_verified=true where id=${buyer.userId}`;
      await q`insert into marketplace_buyer_verifications(user_id,mobile_verified_at,evidence_ref) values(${buyer.userId},now(),'synthetic-load-only')`;
      const [product]=await q`insert into products(store_id,slug,name,description,category,status,product_type) values(${stores[i%20]!.id},${'checkout-'+i},'Synthetic dice','Disposable load fixture','dice','PUBLISHED','READY_TO_SHIP') returning id`;
      const [variant]=await q`insert into product_variants(product_id,sku,name,price_rial,is_default,per_order_limit) values(${product!.id},${randomUUID()},'Default',100000,true,1) returning id`;
      await q`insert into inventory(variant_id,quantity_on_hand) values(${variant!.id},10)`;
      fixtures.push({buyer,productId:product!.id as string,variantId:variant!.id as string});
    }
    const origin=await api.app.listen({host:'127.0.0.1',port:0});
    for(const [offset,count] of [[0,20],[20,100]]){
      const stages:Record<string,{durationsMs:number[];statuses:Record<string,number>}>={};
      const journeyTimes:number[]=[];const errors:string[]=[];const started=performance.now();
      async function post(stage:string,url:string,body:unknown,token?:string,extra:Record<string,string>={}){
        const before=performance.now();
        try{
          const response=await fetch(origin+url,{method:'POST',headers:{'content-type':'application/json',...(token?{authorization:`Bearer ${token}`} :{}),...extra},body:JSON.stringify(body),signal:AbortSignal.timeout(120000)});
          const stats=stages[stage]??= {durationsMs:[],statuses:{}};stats.durationsMs.push(performance.now()-before);stats.statuses[String(response.status)]=(stats.statuses[String(response.status)]??0)+1;
          const payload:any=await response.json();assert.equal(response.status,stage==='capture'?200:201,stage+': '+JSON.stringify(payload));return payload;
        }catch(error){throw new Error(stage+': '+String(error));}
      }
      await Promise.all(fixtures.slice(offset,offset+count).map(async fixture=>{
        const began=performance.now();
        try{
          const preview=await post('preview','/api/v1/marketplace/v21/checkout/preview',{items:[{productId:fixture.productId,variantId:fixture.variantId,quantity:1}]},fixture.buyer.token);
          const order=await post('order','/api/v1/marketplace/v21/orders',{snapshotId:preview.id,idempotencyKey:randomUUID(),address},fixture.buyer.token);
          const intent=await post('intent',`/api/v1/marketplace/orders/${order.order.id}/payment-intent`,{idempotencyKey:randomUUID()},fixture.buyer.token);
          const intentId=intent.intent?.id??intent.paymentIntent?.id??intent.intentId;
          assert.ok(intentId,'payment intent identifier missing');
          const event={eventId:randomUUID(),type:'payment.succeeded',intentId,providerPaymentId:randomUUID()};
          const signature=createHmac('sha256',process.env.MOCK_PAYMENT_WEBHOOK_SECRET!).update(JSON.stringify(event)).digest('hex');
          await post('capture','/api/v1/payments/webhooks/mock',event,undefined,{'x-dnd-mock-signature':signature});
        }catch(error){errors.push(String(error));}finally{journeyTimes.push(performance.now()-began);}
      }));
      const [orders]=await q`select count(*)::int total,count(*) filter(where status='PAID')::int paid from marketplace_orders`;
      const [payments]=await q`select count(*)::int succeeded from payments where status='SUCCEEDED'`;
      const [stock]=await q`select sum(quantity_reserved)::int reserved,count(*) filter(where quantity_on_hand<>9 and variant_id in ${q(fixtures.slice(0,offset+count).map(f=>f.variantId))})::int wrong_decrement from inventory`;
      const [ledger]=await q`select count(*)::int unbalanced from (select transaction_id from financial_ledger_postings group by transaction_id having sum(amount_rial)<>0)t`;
      const expected=offset+count;
      const invariants={expectedCumulativePaid:expected,orders,payments,stock,ledger};
      report.profiles.push({concurrentDistinctBuyers:count,elapsedMs:performance.now()-started,completedJourneys:count-errors.length,errors,journeyLatencyMs:{p50:percentile(journeyTimes,.5),p95:percentile(journeyTimes,.95),p99:percentile(journeyTimes,.99)},stages:Object.fromEntries(Object.entries(stages).map(([name,s])=>[name,{requests:s.durationsMs.length,statuses:s.statuses,p50Ms:percentile(s.durationsMs,.5),p95Ms:percentile(s.durationsMs,.95),p99Ms:percentile(s.durationsMs,.99)}])),invariants});save();
      assert.equal(errors.length,0,JSON.stringify(errors));assert.equal(orders!.total,expected);assert.equal(orders!.paid,expected);assert.equal(payments!.succeeded,expected);assert.equal(stock!.reserved,0);assert.equal(stock!.wrong_decrement,0);assert.equal(ledger!.unbalanced,0);
      console.log(JSON.stringify({scenario:'LOAD-02',buyers:count,passed:true,reportPath}));
    }
    report.completed=true;report.finished=new Date().toISOString();
  }catch(error){report.failure=String(error);throw error;}finally{save();await q.end();await api.stop();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
