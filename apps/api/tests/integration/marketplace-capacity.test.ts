import assert from 'node:assert/strict';
import {createHmac,randomUUID,randomInt} from 'node:crypto';
import {before,after,test} from 'node:test';
import postgres from 'postgres';
import {startApi,type TestApi} from '../support/api.js';
let api:TestApi,owner:Awaited<ReturnType<TestApi['register']>>,buyer:typeof owner,other:typeof owner;
let storeId:string,productId:string,variantId:string,windowId:string,otherWindowId:string;
let paidOrderId:string;
const accepted:string[]=[];
const bookingAttempts=process.env.MARKETPLACE_TEST_MODE==='smoke'?3:100;
const sourceAddress='10.48.'+randomInt(1,254)+'.'+randomInt(1,254);
const address={fullName:'Synthetic Buyer',phone:'09120000000',province:'Tehran',city:'Tehran',addressLine1:'Synthetic street',postalCode:'1234567890'};
async function sql<T>(run:(q:ReturnType<typeof postgres>)=>Promise<T>){const q=postgres(process.env.DATABASE_URL!,{max:1});try{return await run(q);}finally{await q.end();}}
const find=(value:any,key:string):any=>{if(!value||typeof value!=='object')return;if(key in value)return value[key];for(const child of Object.values(value)){const found=find(child,key);if(found!==undefined)return found;}};
const when=(hours:number)=>new Date(Date.now()+hours*3600000).toISOString();
const path=()=>`/api/v1/marketplace/v21/seller/stores/${storeId}/variants/${variantId}/capacity-windows`;
function order(version=1,selected=windowId,quantity=1){return api.request({method:'POST',url:'/api/v1/marketplace/orders',token:buyer.token,remoteAddress:sourceAddress,payload:{idempotencyKey:randomUUID(),address,items:[{productId,variantId,expectedPriceRial:100000,capacityWindowId:selected,expectedCapacityVersion:version,quantity}]}});}
async function pay(orderId:string){
 const intent=await api.request({method:'POST',url:`/api/v1/marketplace/orders/${orderId}/payment-intent`,token:buyer.token,payload:{idempotencyKey:randomUUID()}});assert.equal(intent.status,201);
 const intentId=find(intent.body,'intentId')??find(find(intent.body,'intent'),'id')??find(find(intent.body,'paymentIntent'),'id');
 const event={eventId:randomUUID(),type:'payment.succeeded',intentId,providerPaymentId:randomUUID()};const signature=createHmac('sha256',process.env.MOCK_PAYMENT_WEBHOOK_SECRET!).update(JSON.stringify(event)).digest('hex');
 assert.equal((await api.request({method:'POST',url:'/api/v1/payments/webhooks/mock',payload:event,headers:{'x-dnd-mock-signature':signature}})).status,200);
}
before(async()=>{
 api=await startApi();owner=await api.register('capacity-owner');buyer=await api.register('capacity-buyer');other=await api.register('capacity-other');
 await sql(async q=>{await q`update users set email_verified=true where id=${buyer.userId}`;await q`insert into marketplace_buyer_verifications (user_id,mobile_verified_at,evidence_ref) values (${buyer.userId},now(),'synthetic-capacity-buyer')`;});
 const slug='capacity-'+randomUUID().slice(0,8);
 const on=await api.request({method:'POST',url:'/api/v1/seller/onboard',token:owner.token,payload:{displayName:'Synthetic maker',storeName:'Synthetic capacity shop',storeSlug:slug,description:'Finite production capacity fixture.',category:'dice'}});assert.equal(on.status,201);
 await sql(async q=>{const[s]=await q`update stores set status='ACTIVE' where slug=${slug} returning id`;storeId=s!.id;
 const[p]=await q`insert into products(store_id,slug,name,description,category,status,product_type,production_days) values(${storeId},'made-dice','Synthetic made dice','Synthetic made-to-order fixture','dice','PUBLISHED','MADE_TO_ORDER',2) returning id`;productId=p!.id;
 const[v]=await q`insert into product_variants(product_id,sku,name,price_rial,is_default,per_order_limit) values(${productId},${randomUUID()},'Default',100000,true,2) returning id`;variantId=v!.id;
 await q`insert into inventory(variant_id,quantity_on_hand) values(${variantId},5)`;});
});
after(async()=>{await api?.stop();});
test('window management is tenant scoped, finite, versioned and refuses overlapping promises',async()=>{
 const body={startsAt:when(24),endsAt:when(96),orderCutoffAt:when(23),capacity:2,reason:'Synthetic three-day manufacturing batch.'};
 assert.equal((await api.request({method:'POST',url:path(),token:other.token,payload:body})).status,403);
 const made=await api.request({method:'POST',url:path(),token:owner.token,payload:body});assert.equal(made.status,201,JSON.stringify(made.body));windowId=made.body.id;
 assert.equal((await api.request({method:'POST',url:path(),token:owner.token,payload:body})).status,409);
 const second=await api.request({method:'POST',url:path(),token:owner.token,payload:{...body,startsAt:when(120),endsAt:when(192),orderCutoffAt:when(119),capacity:3}});assert.equal(second.status,201);otherWindowId=second.body.id;
});
test(bookingAttempts+' bookings cannot exceed the selected production window or consume another window',async()=>{
 const missing=await api.request({method:'POST',url:'/api/v1/marketplace/orders',token:buyer.token,payload:{idempotencyKey:randomUUID(),address,items:[{productId,variantId,expectedPriceRial:100000,quantity:1}]}});assert.equal(missing.status,409);
 const rs=await Promise.all(Array.from({length:bookingAttempts},()=>order()));assert.equal(rs.filter(r=>r.status===201).length,2,JSON.stringify(rs.map(r=>r.status)));assert.ok(rs.every(r=>r.status===201||r.status===409));
 for(const r of rs.filter(r=>r.status===201))accepted.push(find(r.body,'orderId')??find(find(r.body,'order'),'id'));
 await sql(async q=>{const[w]=await q`select reserved,committed from marketplace_capacity_windows where id=${windowId}`;assert.equal(w!.reserved,2);assert.equal(w!.committed,0);const[o]=await q`select reserved from marketplace_capacity_windows where id=${otherWindowId}`;assert.equal(o!.reserved,0);});
});
test('cancellation, expiry and payment replay keep both inventory and temporal counters consistent',async()=>{
 const cancel=await api.request({method:'POST',url:`/api/v1/marketplace/orders/${accepted[0]}/cancel`,token:buyer.token});assert.equal(cancel.status,200,JSON.stringify(cancel.body));
 assert.equal((await api.request({method:'POST',url:`/api/v1/marketplace/orders/${accepted[0]}/cancel`,token:buyer.token})).status,200);
 const replacement=await order();assert.equal(replacement.status,201);const replacementId=find(replacement.body,'orderId')??find(find(replacement.body,'order'),'id');
 paidOrderId=accepted[1]!;
 const intent=await api.request({method:'POST',url:`/api/v1/marketplace/orders/${paidOrderId}/payment-intent`,token:buyer.token,payload:{idempotencyKey:randomUUID()}});assert.equal(intent.status,201);
 const intentId=find(intent.body,'intentId')??find(find(intent.body,'intent'),'id')??find(find(intent.body,'paymentIntent'),'id');
 const event={eventId:randomUUID(),type:'payment.succeeded',intentId,providerPaymentId:randomUUID()};const signature=createHmac('sha256',process.env.MOCK_PAYMENT_WEBHOOK_SECRET!).update(JSON.stringify(event)).digest('hex');
 for(let i=0;i<2;i++)assert.equal((await api.request({method:'POST',url:'/api/v1/payments/webhooks/mock',payload:event,headers:{'x-dnd-mock-signature':signature}})).status,200);
 await sql(async q=>{const[w]=await q`select reserved,committed from marketplace_capacity_windows where id=${windowId}`;assert.equal(w!.reserved,1);assert.equal(w!.committed,1);await q`update marketplace_orders set expires_at=now()-interval '1 minute' where id=${replacementId}`;});
 const {expireDueOrders}=await import('../../src/payments/payment-service.js');await expireDueOrders();await expireDueOrders();
 await sql(async q=>{const[w]=await q`select reserved,committed from marketplace_capacity_windows where id=${windowId}`;assert.equal(w!.reserved,0);assert.equal(w!.committed,1);const[i]=await q`select quantity_on_hand,quantity_reserved from inventory where variant_id=${variantId}`;assert.equal(i!.quantity_on_hand,4);assert.equal(i!.quantity_reserved,0);});
});
test('window edits use optimistic version and never reduce capacity below allocated work',async()=>{
 const url=path()+'/'+windowId;
 const changed=await api.request({method:'PATCH',url,token:owner.token,payload:{expectedVersion:1,capacity:3,reason:'Synthetic capacity expansion.'}});assert.equal(changed.status,200,JSON.stringify(changed.body));
 assert.equal((await api.request({method:'PATCH',url,token:owner.token,payload:{expectedVersion:1,capacity:4,reason:'Stale revision must fail.'}})).status,409);
 assert.equal((await order(1)).status,409,'old accepted slot versions require new consent');
 assert.equal((await order(2)).status,201);
 assert.equal((await api.request({method:'PATCH',url,token:owner.token,payload:{expectedVersion:2,capacity:1,reason:'Cannot shrink existing promises.'}})).status,409);
});
test('partial unstarted refunds return only selected capacity; started work stays consumed',async()=>{
 const pending=await sql(q=>q`select id from marketplace_orders where user_id=${buyer.userId} and status='PENDING_PAYMENT'`);
 for(const p of pending)assert.equal((await api.request({method:'POST',url:`/api/v1/marketplace/orders/${p.id}/cancel`,token:buyer.token})).status,200);
 const placed=await order(2,windowId,2);assert.equal(placed.status,201,JSON.stringify(placed.body));const orderId=find(placed.body,'orderId')??find(find(placed.body,'order'),'id');await pay(orderId);
 const[line]=await sql(q=>q`select * from marketplace_order_items where order_id=${orderId}`);
 await sql(q=>q`insert into marketplace_admins(user_id,role) values(${other.userId},'MARKETPLACE_ADMIN')`);process.env.DND_ENABLE_MOCK_SELLER_REFUNDS='true';
 const{allocateItemRefund}=await import('../../src/refunds/item-refund-allocation.js');const{executeSellerOrderRefundCase}=await import('../../src/refunds/seller-order-refund-execution.js');
 const prior:ReturnType<typeof allocateItemRefund>[]=[];
 for(let n=0;n<2;n++){
  const scope={items:[{itemId:line!.id,quantity:1}],shippingRial:0};
  const plan=allocateItemRefund({items:[{itemId:line!.id,quantity:2,lineTotalRial:Number(line!.line_total_rial),commissionRial:Number(line!.commission_rial),sellerNetRial:Number(line!.seller_net_rial)}],shippingRial:0},scope,prior);
  const[c]=await sql(q=>q`insert into marketplace_refund_cases(order_id,seller_order_id,store_id,buyer_user_id,reason,description,status,requested_scope,item_allocation,refund_amount_rial,commission_reversal_rial,seller_net_reversal_rial,financial_plan_created_at)
   values(${orderId},${line!.seller_order_id},${storeId},${buyer.userId},'DAMAGED','Synthetic approved capacity refund','APPROVED',${q.json(scope)},${q.json(plan)},${plan.refundAmountRial},${plan.commissionReversalRial},${plan.sellerNetReversalRial},now()) returning id`);
  await executeSellerOrderRefundCase(c!.id,other.userId);prior.push(plan);
  await sql(async q=>{const[w]=await q`select committed from marketplace_capacity_windows where id=${windowId}`;assert.equal(w!.committed,2,'one old unit plus one started unit remain allocated');const[i]=await q`select quantity_on_hand from inventory where variant_id=${variantId}`;assert.equal(i!.quantity_on_hand,3);});
  if(n===0){const started=await api.request({method:'POST',url:`/api/v1/seller/stores/${storeId}/orders/${line!.seller_order_id}/fulfillment`,token:owner.token,payload:{action:'PROCESSING',items:[{itemId:line!.id,quantity:1}]}});assert.equal(started.status,200,JSON.stringify(started.body));}
 }
});
