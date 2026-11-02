import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { before, after, test } from 'node:test';
import postgres from 'postgres';
import { startApi, type TestApi } from '../support/api.js';

let api: TestApi;
let owner: Awaited<ReturnType<TestApi['register']>>;
let other: Awaited<ReturnType<TestApi['register']>>;
let storeId: string;
let productId: string;
let variantId: string;
const slug = `qa-${randomUUID().slice(0,8)}`;
async function sql(run: (q: ReturnType<typeof postgres>) => Promise<unknown>) {
  const q = postgres(process.env.DATABASE_URL!, { max: 1 });
  try { return await run(q); } finally { await q.end(); }
}
before(async () => {
  api = await startApi(); owner = await api.register('market-owner'); other = await api.register('market-other');
  const onboard = await api.request({method:'POST',url:'/api/v1/seller/onboard',token:owner.token,payload:{displayName:'Maker',storeName:'کارگاه تست',storeSlug:slug,description:'فروشگاه آزمایشی با داده ساختگی',category:'dice'}});
  assert.equal(onboard.status,201,JSON.stringify(onboard.body));
  await sql(async q => {
    const [s] = await q`select id from stores where slug=${slug}`; storeId=s.id;
    await q`update stores set status='ACTIVE' where id=${storeId}`;
    const [p] = await q`insert into products(store_id,slug,name,description,category,status) values(${storeId},'dice','تاس آبی','توضیح ساختگی','dice','PUBLISHED') returning id`; productId=p.id;
    const [v] = await q`insert into product_variants(product_id,sku,name,price_rial,is_default) values(${productId},${randomUUID()},'آبی',100000,true) returning id`; variantId=v.id;
    await q`insert into inventory(variant_id,quantity_on_hand,quantity_reserved) values(${variantId},1,0)`;
  });
});
after(async()=>{await api?.stop();});

test('catalog is paginated and suspended stores disappear from list and direct URLs',async()=>{
  const list=await api.request({method:'GET',url:'/api/v1/products?limit=1'});
  assert.equal(list.status,200); assert.equal(list.body.data.length,1); assert.equal(list.body.pagination.limit,1);
  assert.equal((await api.request({method:'GET',url:'/api/v1/products?limit=10000'})).status,400);
  await sql(q=>q`update stores set status='SUSPENDED' where id=${storeId}`);
  assert.equal((await api.request({method:'GET',url:`/api/v1/stores/${slug}/products/dice`})).status,404);
  const hidden=await api.request({method:'GET',url:`/api/v1/products?q=${encodeURIComponent('تاس')}`}); assert.equal(hidden.body.data.length,0);
  await sql(q=>q`update stores set status='ACTIVE' where id=${storeId}`);
});

test('seller variant writes are tenant scoped, preserve reservations and record independent price history',async()=>{
  const path=`/api/v1/marketplace/v21/seller/stores/${storeId}/variants/${variantId}`;
  const change={priceRial:120000,stock:2,options:{color:'آبی',faces:'20'},perOrderLimit:2,reason:'Synthetic supplier price revision'};
  assert.equal((await api.request({method:'PATCH',url:path,token:other.token,payload:change})).status,403);
  assert.equal((await api.request({method:'PATCH',url:path,token:owner.token,payload:change})).status,200);
  const detail=await api.request({method:'GET',url:`/api/v1/stores/${slug}/products/dice`});
  assert.equal(detail.body.variants[0].priceRial,120000); assert.equal(detail.body.variants[0].options.color,'آبی');
  assert.ok(detail.body.variants[0].priceEffectiveAt);
  await sql(async q=>{const [h]=await q`select actor_id,reason from marketplace_price_history where variant_id=${variantId} order by effective_at desc limit 1`;assert.equal(h.actor_id,owner.userId);assert.equal(h.reason,change.reason);});
  assert.equal((await api.request({method:'GET',url:path+'/price-history',token:other.token})).status,403);
  const history=await api.request({method:'GET',url:path+'/price-history',token:owner.token});assert.equal(history.status,200);assert.equal(history.body.data[0].actorId,owner.userId);
  await sql(q=>q`update inventory set quantity_reserved=1 where variant_id=${variantId}`);
  assert.equal((await api.request({method:'PATCH',url:path,token:owner.token,payload:{stock:0}})).status,409);
  await sql(q=>q`update inventory set quantity_reserved=0 where variant_id=${variantId}`);
});

test('canonical combination uniqueness survives concurrent different-SKU creation and reordered keys',async()=>{
  const path=`/api/v1/marketplace/v21/seller/stores/${storeId}/products/${productId}/variants`;
  const results=await Promise.all([{faces:'12',color:'بنفش'},{color:'بنفش',faces:'12'}].map(options=>api.request({method:'POST',url:path,token:owner.token,
    payload:{sku:randomUUID(),name:'ترکیب یکسان',priceRial:100000,stock:2,options}})));
  assert.deepEqual(results.map(r=>r.status).sort(),[201,409]);
  for(const key of ['constructor','toString']){
    const bypass=await api.request({method:'POST',url:path,token:owner.token,payload:{sku:randomUUID(),name:'نباید ساخته شود',priceRial:100000,stock:1,options:{faces:'12',color:'بنفش',[key]:'unapproved'}}});
    assert.equal(bypass.status,400,'inherited JavaScript keys are not category attributes');
  }
});

test('favorites are persistent per account; review requires delivered purchase; article needs moderation',async()=>{
  const base='/api/v1/marketplace/v21';
  assert.equal((await api.request({method:'PUT',url:`${base}/favorites/${productId}`,token:owner.token})).status,200);
  assert.equal((await api.request({method:'GET',url:`${base}/favorites`,token:owner.token})).body.data.length,1);
  assert.equal((await api.request({method:'GET',url:`${base}/favorites`,token:other.token})).body.data.length,0);
  assert.equal((await api.request({method:'POST',url:`${base}/stores/${storeId}/reviews`,token:other.token,payload:{rating:5,body:'خریدی انجام نشده'}})).status,403);
  const article=await api.request({method:'POST',url:`${base}/seller/stores/${storeId}/articles`,token:owner.token,payload:{title:'راهنمای تاس',body:'<script>alert(1)</script> متن مقاله'}});
  assert.equal(article.status,201);
  const pub=await api.request({method:'GET',url:`${base}/stores/${storeId}/content`}); assert.equal(pub.body.articles.length,0);
});

test('seller cannot attest delivery to release money; production finance readiness fails closed',async()=>{
  const r=await api.request({method:'POST',url:`/api/v1/seller/stores/${storeId}/orders/${randomUUID()}/fulfillment`,token:owner.token,payload:{action:'DELIVER'}});
  assert.equal(r.status,403);
  const gates=await api.request({method:'GET',url:'/api/v1/marketplace/v21/readiness'}); assert.equal(gates.status,200);
  assert.equal(gates.body.livePayments,false); assert.equal(gates.body.livePayouts,false);
});

test('checkout uses selected variant, rejects repricing, and 100 concurrent requests cannot oversell it',async()=>{
  const added=await api.request({method:'POST',url:`/api/v1/marketplace/v21/seller/stores/${storeId}/products/${productId}/variants`,token:owner.token,payload:{sku:`red-${randomUUID()}`,name:'قرمز',priceRial:150000,stock:1,options:{color:'قرمز'},perOrderLimit:1}});
  assert.equal(added.status,201,JSON.stringify(added.body));
  const selected=added.body.id;
  const address={fullName:'Synthetic Buyer',phone:'09120000000',province:'Tehran',city:'Tehran',addressLine1:'Synthetic test street',postalCode:'1234567890'};
  const order=(expectedPriceRial:number)=>({remoteAddress:'10.41.0.1',method:'POST' as const,url:'/api/v1/marketplace/orders',token:other.token,payload:{idempotencyKey:randomUUID(),address,items:[{productId,variantId:selected,expectedPriceRial,quantity:1}]}});
  assert.equal((await api.request(order(140000))).status,409,'a changed price requires new acceptance');
  const results=await Promise.all(Array.from({length:100},()=>api.request(order(150000))));
  assert.equal(results.filter(r=>r.status===201).length,1,JSON.stringify(results.map(r=>r.status)));
  assert.ok(results.every(r=>r.status===201||r.status===409),JSON.stringify(results.map(r=>r.status)));
  await sql(async q=>{
    const [chosen]=await q`select quantity_reserved from inventory where variant_id=${selected}`;assert.equal(chosen?.quantity_reserved,1);
    const [untouched]=await q`select quantity_reserved from inventory where variant_id=${variantId}`;assert.equal(untouched?.quantity_reserved,0);
  });
});

test('private references reject guessed keys and malicious media; financial journal cannot be mutated',async()=>{
  const bad=await api.request({method:'POST',url:'/api/v1/marketplace/v21/custom-requests',token:other.token,payload:{storeId,referenceKey:`private/${other.userId}/${randomUUID()}`,desiredOutput:'مینیاتور',dimensions:'32mm',material:'رزین',quantity:1}});assert.equal(bad.status,400);
  assert.equal((await api.request({method:'POST',url:'/api/v1/marketplace/v21/media',token:other.token,payload:{dataWebp:'data:image/svg+xml;base64,PHN2ZyBvbmxvYWQ9YWxlcnQoMSk+'}})).status,400);
  assert.equal((await api.request({method:'GET',url:`/api/v1/marketplace/v21/media/${randomUUID()}`,token:owner.token})).status,404);
  await sql(async q=>{await assert.rejects(q`update financial_ledger_postings set amount_rial=amount_rial+1`,/immutable|journal/i);});
});

test('50 concurrent checkouts cannot exceed seller exposure cap',async()=>{
 await sql(async q=>{const [r]=await q`select coalesce(sum(gross_rial),0)::int as exposure from marketplace_seller_orders where store_id=${storeId} and status not in ('CANCELLED','REFUNDED')`;await q`update stores set risk_cap_rial=${Number(r?.exposure)+240000} where id=${storeId}`;await q`update inventory set quantity_on_hand=50,quantity_reserved=0 where variant_id=${variantId}`;});
 const address={fullName:'Synthetic Buyer',phone:'09120000000',province:'Tehran',city:'Tehran',addressLine1:'Synthetic test street',postalCode:'1234567890'};
 const rs=await Promise.all(Array.from({length:50},()=>api.request({remoteAddress:'10.41.0.2',method:'POST',url:'/api/v1/marketplace/orders',token:other.token,payload:{idempotencyKey:randomUUID(),address,items:[{productId,variantId,expectedPriceRial:120000,quantity:1}]}})));
 assert.equal(rs.filter(r=>r.status===201).length,2,JSON.stringify(rs.map(r=>r.status)));assert.ok(rs.every(r=>r.status===201||r.status===409));
});

test('canonical checkout requires verified buyer and accepts independent shipping snapshots',async()=>{
 const body={items:[{productId,variantId,quantity:1}]};
 const path='/api/v1/marketplace/v21/checkout/preview';
 assert.equal((await api.request({method:'POST',url:path,token:other.token,payload:body})).status,403);
 await sql(async q=>{await q`update users set email_verified=true where id=${other.userId}`;await q`insert into marketplace_buyer_verifications(user_id,mobile_verified_at,evidence_ref) values(${other.userId},now(),'synthetic-only')`;await q`update stores set risk_cap_rial=100000000 where id=${storeId}`;await q`insert into marketplace_shipping_profiles(store_id,method,fee_rial,dispatch_days) values(${storeId},'Manual test carrier',30000,3)`;});
 const preview=await api.request({method:'POST',url:path,token:other.token,payload:body});assert.equal(preview.status,201,JSON.stringify(preview.body));assert.equal(preview.body.shipping[0].feeRial,30000);
 const address={fullName:'Synthetic Buyer',phone:'09120000000',province:'Tehran',city:'Tehran',addressLine1:'Synthetic test street',postalCode:'1234567890'};
 await sql(q=>q`update marketplace_shipping_profiles set version=version+1,fee_rial=40000 where store_id=${storeId}`);
 const order=await api.request({method:'POST',url:'/api/v1/marketplace/v21/orders',token:other.token,payload:{snapshotId:preview.body.id,idempotencyKey:randomUUID(),address}});assert.equal(order.status,409);
 const current=await api.request({method:'POST',url:path,token:other.token,payload:body});assert.equal(current.status,201);
 const accepted=await api.request({method:'POST',url:'/api/v1/marketplace/v21/orders',token:other.token,payload:{snapshotId:current.body.id,idempotencyKey:randomUUID(),address}});assert.equal(accepted.status,201,JSON.stringify(accepted.body));
 await sql(async q=>{const [o]=await q`select customer_total_rial,shipping_total_rial from marketplace_orders where id=${accepted.body.order.id}`;assert.equal(Number(o?.customer_total_rial),160000);assert.equal(Number(o?.shipping_total_rial),40000);});
});

test('review regressions: empty pages retain totals, SKU aliases cannot bypass limits, and concurrent variant edits complete',async()=>{
 const far=await api.request({method:'GET',url:'/api/v1/products?page=99'});assert.equal(far.status,200);assert.equal(far.body.data.length,0);assert.equal(far.body.pagination.total,1);
 const rs=await Promise.all(Array.from({length:10},(_,i)=>api.request({method:'PATCH',url:`/api/v1/marketplace/v21/seller/stores/${storeId}/variants/${variantId}`,token:owner.token,remoteAddress:`10.31.0.${i+1}`,payload:{options:{color:'آبی'},perOrderLimit:1}})));
 assert.ok(rs.every(r=>r.status===200),JSON.stringify(rs.map(r=>r.status)));
 const address={fullName:'Synthetic Buyer',phone:'09120000000',province:'Tehran',city:'Tehran',addressLine1:'Synthetic test street',postalCode:'1234567890'};
 const alias=await api.request({method:'POST',url:'/api/v1/marketplace/orders',token:other.token,remoteAddress:'10.31.1.1',payload:{idempotencyKey:randomUUID(),address,items:[{productId,quantity:1},{productId,variantId,expectedPriceRial:120000,quantity:1}]}});assert.equal(alias.status,409);
 const invalid=await api.request({method:'POST',url:`/api/v1/marketplace/v21/seller/stores/${storeId}/products`,token:owner.token,remoteAddress:'10.31.1.2',payload:{slug:'invalid-category',name:'Invalid',description:'Invalid test',category:'unknown-category',productType:'READY_TO_SHIP',variant:{sku:'invalid-test',name:'Default',priceRial:1000,stock:1}}});assert.equal(invalid.status,400);
});
