import assert from 'node:assert/strict';
import {test} from 'node:test';
import postgres from 'postgres';
import {startApi} from '../support/api.js';

test('sales reports enforce roles and tenant scope, preserve exact money and allocate finalized refunds',async()=>{
 const api=await startApi();api.app.log.level='silent';const q=postgres(process.env.DATABASE_URL!,{max:1});
 try{
  const owner=await api.register('sales-owner'),other=await api.register('sales-other'),buyer=await api.register('sales-buyer'),admin=await api.register('sales-admin'),support=await api.register('sales-support');
  await q`insert into marketplace_admins(user_id,role,active) values(${admin.userId},'MARKETPLACE_ADMIN',true),(${support.userId},'SUPPORT',true)`;
  async function store(userId:string,slug:string){const [sp]=await q`insert into seller_profiles(user_id,display_name,status) values(${userId},'Synthetic seller','ACTIVE') returning id`;const [s]=await q`insert into stores(seller_profile_id,slug,name,description,category,status) values(${sp!.id},${slug},${slug},'Synthetic','dice','ACTIVE') returning id`;await q`insert into store_members(store_id,user_id,role) values(${s!.id},${userId},'OWNER')`;return s!.id as string;}
  const s1=await store(owner.userId,'sales-one'),s2=await store(other.userId,'sales-two');
  const big='9007199254738991';
  const [o]=await q`insert into marketplace_orders(user_id,idempotency_key,status,customer_total_rial,platform_commission_rial,seller_net_rial,expires_at) values(${buyer.userId},'sales-order','PAID',${big}::bigint+2000,0,${big}::bigint+2000,now()) returning id`;
  const [so]=await q`insert into marketplace_seller_orders(order_id,store_id,status,gross_rial,commission_bps_snapshot,platform_commission_rial,seller_net_rial,created_at) values(${o!.id},${s1},'PAID',${big},0,0,${big},'2026-11-01T10:00:00.123456Z') returning id`;
  await q`insert into marketplace_seller_orders(order_id,store_id,status,gross_rial,commission_bps_snapshot,platform_commission_rial,seller_net_rial,created_at) values(${o!.id},${s2},'PAID',2000,0,0,2000,'2026-11-01T10:00:00.123456Z')`;
  const [intent]=await q`insert into payment_intents(order_id,provider,amount_rial,idempotency_key,expires_at) values(${o!.id},'mock',${big}::bigint+2000,'sales-intent',now()) returning id`;
  const [payment]=await q`insert into payments(order_id,payment_intent_id,provider,provider_payment_id,amount_rial,refunded_rial,status,paid_at) values(${o!.id},${intent!.id},'mock','sales-payment',${big}::bigint+2000,1000,'PARTIALLY_REFUNDED',now()) returning id`;
  const [refund]=await q`insert into refunds(order_id,payment_id,provider,idempotency_key,amount_rial,status,reason,succeeded_at) values(${o!.id},${payment!.id},'mock','sales-refund',1000,'SUCCEEDED','Synthetic refund',now()) returning id`;
  await q`insert into marketplace_refund_cases(order_id,seller_order_id,store_id,buyer_user_id,reason,description,status,refund_amount_rial,commission_reversal_rial,seller_net_reversal_rial,financial_refund_id) values(${o!.id},${so!.id},${s1},${buyer.userId},'DAMAGED','Synthetic finalized allocation','REFUNDED',1000,0,1000,${refund!.id})`;
  const url='/api/v1/admin/marketplace/sales',seller='/api/v1/marketplace/v21/seller/sales';
  assert.equal((await api.request({method:'GET',url,token:support.token})).status,403);
  assert.equal((await api.request({method:'GET',url,token:owner.token})).status,403);
  assert.equal((await api.request({method:'GET',url:seller})).status,401);
  assert.equal((await api.request({method:'GET',url:seller+'?storeId='+s2,token:owner.token})).status,403);
  const own=await api.request({method:'GET',url:seller,token:owner.token});assert.equal(own.status,200,JSON.stringify(own.body));assert.equal(own.body.data.length,1);assert.equal(own.body.summary.paidRial,big);assert.equal(own.body.summary.refundedRial,'1000');assert.equal(own.body.summary.netPaidRial,'9007199254737991');assert.equal(own.body.summary.mismatchCount,0);
  const all=await api.request({method:'GET',url:url+'?limit=1',token:admin.token});assert.equal(all.status,200,JSON.stringify(all.body));assert.equal(all.body.summary.orderCount,2);assert.equal(all.body.summary.paidRial,'9007199254740991');assert.equal(all.body.summary.refundedRial,'1000');assert.ok(all.body.nextCursor);
  const second=await api.request({method:'GET',url:url+'?limit=1&cursor='+all.body.nextCursor,token:admin.token});assert.equal(second.status,200);assert.equal(second.body.data.length,1);assert.notEqual(second.body.data[0].id,all.body.data[0].id);assert.equal(second.body.nextCursor,null);assert.deepEqual(second.body.summary,all.body.summary);
  const end=await api.request({method:'GET',url:url+'?to=2026-11-01T10:00:00.123456Z',token:admin.token});assert.equal(end.body.summary.orderCount,0);
  const microseconds=await api.request({method:'GET',url:url+'?from=2026-11-01T10:00:00.123456Z&to=2026-11-01T10:00:00.123457Z',token:admin.token});assert.equal(microseconds.status,200);assert.equal(microseconds.body.summary.orderCount,2);
  const filtered=await api.request({method:'GET',url:url+'?storeId='+s2+'&paymentStatus=PARTIALLY_REFUNDED&fulfillmentStatus=PAID&q=sales-two',token:admin.token});assert.equal(filtered.body.summary.paidRial,'2000');assert.equal(filtered.body.summary.refundedRial,'0');
  assert.equal((await api.request({method:'GET',url:url+'?limit=51',token:admin.token})).status,400);
  await q`update payments set refunded_rial=1001 where id=${payment!.id}`;
  const mismatch=await api.request({method:'GET',url:seller,token:owner.token});assert.equal(mismatch.body.summary.mismatchCount,1);
  await q`update payments set refunded_rial=1000 where id=${payment!.id}`;
  const [legacy]=await q`insert into marketplace_orders(user_id,idempotency_key,status,customer_total_rial,platform_commission_rial,seller_net_rial,expires_at) values(${buyer.userId},'sales-legacy','REFUNDED',5000,500,4500,now()) returning id`;
  const [legacySo]=await q`insert into marketplace_seller_orders(order_id,store_id,status,gross_rial,commission_bps_snapshot,platform_commission_rial,seller_net_rial,shipping_snapshot) values(${legacy!.id},${s1},'REFUNDED',5000,1000,500,4500,'{"feeRial":1000}') returning id`;
  const [legacyIntent]=await q`insert into payment_intents(order_id,provider,amount_rial,idempotency_key,expires_at) values(${legacy!.id},'mock',5000,'sales-legacy-intent',now()) returning id`;
  const [legacyPayment]=await q`insert into payments(order_id,payment_intent_id,provider,provider_payment_id,amount_rial,refunded_rial,status,paid_at) values(${legacy!.id},${legacyIntent!.id},'mock','sales-legacy-payment',5000,5000,'REFUNDED',now()) returning id`;
  await q`insert into refunds(order_id,payment_id,provider,idempotency_key,amount_rial,status,reason,succeeded_at) values(${legacy!.id},${legacyPayment!.id},'mock','sales-legacy-refund',5000,'SUCCEEDED','Synthetic legacy full refund',now())`;
  const [product]=await q`insert into products(store_id,slug,name,description,category,status) values(${s1},'sales-product','Current renamed product','Synthetic','dice','DRAFT') returning id`;
  const [variant]=await q`insert into product_variants(product_id,sku,name,price_rial,is_default) values(${product!.id},'sales-sku','Current variant',9000,true) returning id`;
  await q`insert into marketplace_order_items(order_id,seller_order_id,store_id,product_id,variant_id,product_name_snapshot,product_slug_snapshot,variant_name_snapshot,sku_snapshot,quantity,unit_price_rial,line_total_rial,commission_bps_snapshot,commission_rial,seller_net_rial) values(${legacy!.id},${legacySo!.id},${s1},${product!.id},${variant!.id},'Historical sold product','sales-product','Historical variant','sales-sku',2,2000,4000,1000,500,3500)`;
  const legacyReport=await api.request({method:'GET',url:url+'?q=Historical',token:admin.token});assert.equal(legacyReport.status,200,JSON.stringify(legacyReport.body));assert.equal(legacyReport.body.data.length,1);assert.equal(legacyReport.body.data[0].items[0].name,'Historical sold product');assert.equal(legacyReport.body.data[0].items[0].unitPriceRial,'2000');assert.equal(legacyReport.body.summary.refundedRial,'5000');assert.equal(legacyReport.body.summary.netPaidRial,'0');assert.equal(legacyReport.body.summary.commissionRial,'0');assert.equal(legacyReport.body.summary.sellerNetRial,'0');assert.equal(legacyReport.body.summary.shippingRial,'1000');assert.equal(legacyReport.body.summary.merchandiseRial,'4000');assert.equal(legacyReport.body.summary.mismatchCount,0);
  const totals=await api.request({method:'GET',url,token:admin.token});assert.equal(totals.body.summary.paidRial,'9007199254745991');assert.equal(totals.body.summary.refundedRial,'6000');
  const [pending]=await q`insert into marketplace_orders(user_id,idempotency_key,customer_total_rial,platform_commission_rial,seller_net_rial,expires_at) values(${buyer.userId},'sales-pending',3000,0,3000,now()) returning id`;
  await q`insert into marketplace_seller_orders(order_id,store_id,gross_rial,commission_bps_snapshot,platform_commission_rial,seller_net_rial) values(${pending!.id},${s1},3000,0,0,3000)`;
  const pendingReport=await api.request({method:'GET',url:seller+'?paymentStatus=NO_PAYMENT',token:owner.token});assert.equal(pendingReport.body.summary.pendingRial,'3000');assert.equal(pendingReport.body.summary.paidRial,'0');assert.equal(pendingReport.body.summary.netPaidRial,'0');
  await q`update marketplace_seller_orders set status='CANCELLED' where order_id=${pending!.id}`;
  const cancelled=await api.request({method:'GET',url:seller+'?paymentStatus=NO_PAYMENT',token:owner.token});assert.equal(cancelled.body.summary.pendingRial,'0');
  await q`update marketplace_seller_orders set status='CANCELLED' where id=${so!.id}`;
  const paidCancelled=await api.request({method:'GET',url:seller+'?fulfillmentStatus=CANCELLED',token:owner.token});assert.equal(paidCancelled.body.summary.mismatchCount,1);
  await q`update store_members set role='MANAGER' where user_id=${owner.userId}`;
  assert.equal((await api.request({method:'GET',url:seller,token:owner.token})).status,200);
  await q`update store_members set role='ORDER_MANAGER' where user_id=${owner.userId}`;
  assert.equal((await api.request({method:'GET',url:seller,token:owner.token})).status,403);
 }finally{await q.end();await api.stop();}
});
