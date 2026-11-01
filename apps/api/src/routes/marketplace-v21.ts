import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { requireAuthUser } from '../auth/session.js';
import { sqlClient as q } from '../db/client.js';
import { getAdmin, reauth } from './admin.js';
import { cleanReferenceImage } from '../marketplace/private-media.js';
import { registerCheckoutV21 } from '../marketplace/checkout.js';

const id=z.string().uuid();
const text=(max=500)=>z.string().trim().min(1).max(max);
const price=z.number().int().min(1000).max(2_000_000_000);
const slug=z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).min(3).max(100);
function fail(statusCode:number,message:string):never{throw Object.assign(new Error(message),{statusCode});}
function parse<T>(schema:z.ZodType<T>,value:unknown):T{const p=schema.safeParse(value);if(!p.success)fail(400,'اطلاعات ارسالی معتبر نیست.');return p.data;}
async function user(req:FastifyRequest){const u=await requireAuthUser(req);if(!u)fail(401,'ابتدا وارد حساب شوید.');return u;}
async function member(req:FastifyRequest,storeId:string,roles=['OWNER','MANAGER','PRODUCT_EDITOR']){
  const u=await user(req);
  const [s]=await q`select s.*,m.role from stores s join store_members m on m.store_id=s.id where s.id=${storeId} and m.user_id=${u.id}`;
  if(!s||!roles.includes(s.role))fail(403,'دسترسی به این فروشگاه مجاز نیست.');
  if(s.status==='SUSPENDED'||s.status==='ARCHIVED')fail(403,'مدیریت محتوای این فروشگاه متوقف است.');
  return {u,s};
}
async function admin(req:FastifyRequest){const a=await getAdmin(req);if(!a||!['SUPER_ADMIN','MARKETPLACE_ADMIN'].includes(a.role))fail(403,'دسترسی مدیر لازم است.');return a;}
const params=(req:FastifyRequest)=>parse(z.record(z.string(),z.string().uuid()),req.params) as Record<'storeId'|'variantId'|'productId'|'requestId'|'quoteId'|'mediaId',string>;
const options=z.record(z.string().max(40),z.string().trim().min(1).max(100)).refine(v=>Object.keys(v).length<=12);
const variantBody=z.object({sku:text(100),name:text(160),priceRial:price,stock:z.number().int().min(0).max(1_000_000),options:options.default({}),perOrderLimit:z.number().int().min(1).max(999).default(99)});
async function validateOptions(category:string,value:Record<string,string>){
  const [d]=await q`select attributes from marketplace_category_definitions where slug=${category}`;
  if(!d)fail(400,'دسته‌بندی معتبر نیست.');
  if(Object.keys(value).some(k=>!d?.attributes?.[k]))fail(400,'مشخصات با دسته‌بندی محصول سازگار نیست.');
}
export async function registerMarketplaceV21(app:FastifyInstance){
  await registerCheckoutV21(app);
  const base='/api/v1/marketplace/v21';
  app.post(`${base}/media`,async(req,reply)=>{
    const u=await user(req);const b=parse(z.object({dataWebp:z.string().max(700000)}),req.body);const clean=cleanReferenceImage(b.dataWebp);if(!clean)fail(400,'تصویر WebP معتبر، حداکثر ۵۰۰ کیلوبایت و ۱۲۸۰×۸۰۰ لازم است.');
    const media=await q.begin(async tx=>{await tx`select pg_advisory_xact_lock(hashtextextended('marketplace-media-quota',0))`;const [size]=await tx`select coalesce(sum(octet_length(data_webp)),0) as total from marketplace_media`;if(Number(size?.total)+Buffer.byteLength(clean)>350000000)fail(409,'ظرفیت فایل‌های بازارچه تکمیل است.');await tx`select id from users where id=${u.id} for update`;const [quota]=await tx`select count(*)::int as count from marketplace_media where owner_id=${u.id}`;if(Number(quota?.count)>=20)fail(409,'سقف فایل‌های حساب تکمیل شده است.');const [m]=await tx`insert into marketplace_media(owner_id,data_webp) values(${u.id},${clean}) returning id`;return m;});return reply.code(201).send({id:media?.id,referenceKey:`private/${u.id}/${media?.id}`});
  });
  app.get(`${base}/media/:mediaId`,async(req,reply)=>{
    const {mediaId}=params(req);const u=await requireAuthUser(req);
    const [m]=await q`select m.data_webp from marketplace_media m where m.id=${mediaId} and (m.owner_id=${u?.id??null} or exists(select 1 from marketplace_custom_requests r join store_members sm on sm.store_id=r.store_id where r.reference_key='private/'||m.owner_id||'/'||m.id and sm.user_id=${u?.id??null}) or exists(select 1 from products p join stores s on s.id=p.store_id where p.image_url=${'/api/marketplace/v21/media/'+mediaId} and p.status='PUBLISHED' and s.status='ACTIVE'))`;
    if(!m)fail(404,'فایل یافت نشد.');return reply.header('cache-control','private, no-store').header('x-content-type-options','nosniff').type('image/webp').send(Buffer.from(m.data_webp.split(',')[1],'base64'));
  });
  app.post(`${base}/seller/stores/:storeId/products/:productId/image`,async req=>{
    const {storeId,productId}=params(req);const {u}=await member(req,storeId);const b=parse(z.object({mediaId:id,publishConsent:z.literal(true)}),req.body);
    const [m]=await q`select id from marketplace_media where id=${b.mediaId} and owner_id=${u.id}`;if(!m)fail(404,'فایل یافت نشد.');const changed=await q`update products set image_url=${'/api/marketplace/v21/media/'+b.mediaId},updated_at=now() where id=${productId} and store_id=${storeId} returning id`;if(!changed.length)fail(404,'محصول یافت نشد.');return {ok:true};
  });
  app.get(`${base}/readiness`,async()=>({catalog:true,sellerDrafts:true,livePayments:false,livePayouts:false,kycIntake:false,carrierCoverage:false,
    gates:await q`select code,decision,(evidence_ref is not null and expires_at>now()) as "evidenceCurrent" from marketplace_gate_decisions order by code`}));
  app.get(`${base}/categories`,async()=>({data:await q`select slug,label,attributes from marketplace_category_definitions order by label`}));
  app.get(`${base}/orders`,async req=>{const u=await user(req);return {data:await q`select id,status,customer_total_rial as "totalRial",shipping_total_rial as "shippingRial",created_at as "createdAt" from marketplace_orders where user_id=${u.id} order by created_at desc limit 100`};});
  app.put(`${base}/seller/stores/:storeId/shipping`,async req=>{
    const {storeId}=params(req);const {u}=await member(req,storeId,['OWNER','MANAGER']);const b=parse(z.object({method:text(100),feeRial:z.number().int().min(0).max(2_000_000_000),dispatchDays:z.number().int().min(1).max(365)}),req.body);
    await q.begin(async tx=>{await tx`insert into marketplace_shipping_profiles(store_id,method,fee_rial,dispatch_days) values(${storeId},${b.method},${b.feeRial},${b.dispatchDays}) on conflict(store_id) do update set method=excluded.method,fee_rial=excluded.fee_rial,dispatch_days=excluded.dispatch_days,version=marketplace_shipping_profiles.version+1,updated_at=now()`;await tx`insert into marketplace_audit(actor_id,action,entity_id) values(${u.id},'SHIPPING_EDIT',${storeId})`;});return {ok:true};
  });
  app.post(`${base}/seller/apply`,async(req,reply)=>{
    const u=await user(req);const b=parse(z.object({name:text(180),slug,description:text(800),category:text(120)}),req.body);
    const [exists]=await q`select id from seller_profiles where user_id=${u.id}`;if(exists)fail(409,'درخواست فروشندگی قبلاً ثبت شده است.');
    const created=await q.begin(async tx=>{
      const [seller]=await tx`insert into seller_profiles(user_id,display_name,status) values(${u.id},${b.name},'PENDING_REVIEW') returning id`;
      if(!seller)fail(500,'Seller insert failed');
      const [store]=await tx`insert into stores(seller_profile_id,name,slug,description,category,status) values(${seller.id},${b.name},${b.slug},${b.description},${b.category},'PENDING_REVIEW') returning id,slug,status`;
      if(!store)fail(500,'Store insert failed');
      await tx`insert into store_members(store_id,user_id,role) values(${store.id},${u.id},'OWNER')`;return store;
    });return reply.code(201).send(created);
  });
  app.get(`${base}/seller/dashboard`,async(req)=>{
    const u=await user(req);
    const stores=await q`select s.id,s.slug,s.name,s.description,s.category,s.status,m.role from stores s join store_members m on m.store_id=s.id where m.user_id=${u.id} order by s.created_at limit 50`;
    const products=await q`select p.id,p.store_id as "storeId",p.name,p.slug,p.category,p.status,p.product_type as "productType",p.brand,p.production_days as "productionDays",
      coalesce(jsonb_agg(jsonb_build_object('id',v.id,'sku',v.sku,'name',v.name,'priceRial',v.price_rial,'stock',i.quantity_on_hand,'reserved',i.quantity_reserved,'options',v.options,'perOrderLimit',v.per_order_limit,'discountRial',v.discount_rial,'discountStartsAt',v.discount_starts_at,'discountEndsAt',v.discount_ends_at) order by v.created_at) filter(where v.id is not null),'[]') variants
      from products p join store_members m on m.store_id=p.store_id and m.user_id=${u.id} left join product_variants v on v.product_id=p.id left join inventory i on i.variant_id=v.id group by p.id order by p.created_at desc limit 200`;
    const articles=await q`select a.id,a.store_id as "storeId",a.title,a.status from marketplace_articles a join store_members m on m.store_id=a.store_id and m.user_id=${u.id} order by a.created_at desc limit 100`;
    const orders=await q`select so.id,so.store_id as "storeId",so.status,so.gross_rial as "grossRial",so.seller_net_rial as "netRial",so.shipping_snapshot as shipping,
      (select coalesce(jsonb_agg(jsonb_build_object('itemId',oi.id,'name',oi.product_name_snapshot,'variantName',oi.variant_name_snapshot,'purchasedQuantity',oi.quantity,'refundedQuantity',r.n,'remainingQuantity',oi.quantity-r.n) order by oi.id),'[]'::jsonb)
       from marketplace_order_items oi cross join lateral (
         select coalesce(sum(case when c.item_allocation is null then oi.quantity else
           coalesce((select sum((x->>'quantity')::int) from jsonb_array_elements(c.item_allocation->'items') x where x->>'itemId'=oi.id::text),0) end),0)::int n
         from marketplace_refund_cases c where c.seller_order_id=so.id and c.status='REFUNDED'
       ) r where oi.seller_order_id=so.id) as items
      from marketplace_seller_orders so join store_members m on m.store_id=so.store_id and m.user_id=${u.id} and m.role in ('OWNER','MANAGER','ORDER_MANAGER') order by so.created_at desc limit 100`;
    const notifications=await q`select n.id,n.store_id as "storeId",n.event_type as "eventType",n.created_at as "createdAt" from seller_notification_outbox n join store_members m on m.store_id=n.store_id and m.user_id=${u.id} where n.recipient_user_id=${u.id} and n.channel='IN_APP' order by n.created_at desc limit 100`;
    return {stores,products,articles,orders,notifications};
  });
  app.patch(`${base}/seller/stores/:storeId`,async req=>{
    const {storeId}=params(req);const {u}=await member(req,storeId,['OWNER','MANAGER']);
    const b=parse(z.object({name:text(180),description:text(800)}),req.body);
    await q.begin(async tx=>{await tx`update stores set name=${b.name},description=${b.description},updated_at=now() where id=${storeId}`;await tx`insert into marketplace_audit(actor_id,action,entity_id) values(${u.id},'STORE_EDIT',${storeId})`;});return {ok:true};
  });
  app.post(`${base}/seller/stores/:storeId/products`,async(req,reply)=>{
    const {storeId}=params(req);const {u}=await member(req,storeId);
    const b=parse(z.object({slug,name:text(220),description:text(1200),category:text(120),productType:z.enum(['READY_TO_SHIP','MADE_TO_ORDER','CUSTOM_DESIGN']),brand:z.string().max(120).default(''),productionDays:z.number().int().min(0).max(365).default(0),variant:variantBody}),req.body);
    await validateOptions(b.category,b.variant.options);if(b.productType==='MADE_TO_ORDER'&&b.productionDays<1)fail(400,'زمان ساخت لازم است.');
    const p=await q.begin(async tx=>{
      const [p]=await tx`insert into products(store_id,slug,name,description,category,product_type,brand,production_days) values(${storeId},${b.slug},${b.name},${b.description},${b.category},${b.productType},${b.brand},${b.productionDays}) returning id`;
      if(!p)fail(500,'Product insert failed');
      const v=b.variant;
      const [row]=await tx`insert into product_variants(product_id,sku,name,price_rial,is_default,options,per_order_limit) values(${p.id},${v.sku},${v.name},${v.priceRial},true,${JSON.stringify(v.options)}::jsonb,${v.perOrderLimit}) returning id`;
      if(!row)fail(500,'Variant insert failed');
      await tx`insert into inventory(variant_id,quantity_on_hand) values(${row.id},${v.stock})`;
      await tx`insert into marketplace_audit(actor_id,action,entity_id) values(${u.id},'PRODUCT_DRAFT',${p.id})`;return p;
    });return reply.code(201).send(p);
  });
  app.post(`${base}/seller/stores/:storeId/products/:productId/variants`,async(req,reply)=>{
    const {storeId,productId}=params(req);await member(req,storeId);const b=parse(variantBody,req.body);
    const [p]=await q`select category from products where id=${productId} and store_id=${storeId}`;if(!p)fail(404,'محصول یافت نشد.');await validateOptions(p.category,b.options);
    const v=await q.begin(async tx=>{await tx`select id from products where id=${productId} and store_id=${storeId} for update`;const [count]=await tx`select count(*)::int as n from product_variants where product_id=${productId}`;if(Number(count?.n)>=100)fail(409,'سقف ۱۰۰ تنوع محصول تکمیل است.');const [v]=await tx`insert into product_variants(product_id,sku,name,price_rial,options,per_order_limit) values(${productId},${b.sku},${b.name},${b.priceRial},${JSON.stringify(b.options)}::jsonb,${b.perOrderLimit}) returning id`;if(!v)fail(500,'Variant insert failed');await tx`insert into inventory(variant_id,quantity_on_hand) values(${v.id},${b.stock})`;return v;});return reply.code(201).send(v);
  });
  app.patch(`${base}/seller/stores/:storeId/variants/:variantId`,async req=>{
    const {storeId,variantId}=params(req);const {u}=await member(req,storeId);
    const b=parse(z.object({priceRial:price.optional(),stock:z.number().int().min(0).max(1_000_000).optional(),options:options.optional(),perOrderLimit:z.number().int().min(1).max(999).optional(),discountRial:price.nullable().optional(),discountStartsAt:z.iso.datetime().nullable().optional(),discountEndsAt:z.iso.datetime().nullable().optional(),reason:text(500).default('Seller inventory adjustment')}).refine(x=>Object.keys(x).length>1),req.body);
    if(b.options){const [p]=await q`select p.category from products p join product_variants v on v.product_id=p.id where v.id=${variantId} and p.store_id=${storeId}`;if(!p)fail(404,'تنوع یافت نشد.');await validateOptions(p.category,b.options);}
    return q.begin(async tx=>{
      const [v]=await tx`select v.*,p.category,i.quantity_on_hand,i.quantity_reserved from product_variants v join products p on p.id=v.product_id and p.store_id=${storeId} join inventory i on i.variant_id=v.id where v.id=${variantId} for update of v,i`;
      if(!v)fail(404,'تنوع یافت نشد.');
      if(b.stock!==undefined){if(b.stock<v.quantity_reserved)fail(409,'موجودی از رزروهای فعال کمتر است.');await tx`update inventory set quantity_on_hand=${b.stock},updated_at=now() where variant_id=${variantId}`;
        await tx`insert into marketplace_stock_movements(variant_id,actor_id,before_quantity,after_quantity,reason) values(${variantId},${u.id},${v.quantity_on_hand},${b.stock},${b.reason})`;}
      const discount=b.discountRial===undefined?v.discount_rial:b.discountRial;
      const starts=b.discountStartsAt===undefined?v.discount_starts_at:b.discountStartsAt;
      const ends=b.discountEndsAt===undefined?v.discount_ends_at:b.discountEndsAt;
      if(discount!==null&&(!starts||!ends||new Date(ends)<=new Date(starts)||Number(discount)>=(b.priceRial??Number(v.price_rial))))fail(400,'بازه یا مبلغ تخفیف معتبر نیست.');
      await tx`update product_variants set price_rial=${b.priceRial??v.price_rial},options=${JSON.stringify(b.options??v.options)}::jsonb,per_order_limit=${b.perOrderLimit??v.per_order_limit},discount_rial=${discount},discount_starts_at=${starts},discount_ends_at=${ends},updated_at=now() where id=${variantId}`;
      await tx`insert into marketplace_audit(actor_id,action,entity_id) values(${u.id},'VARIANT_EDIT',${variantId})`;return {ok:true};
    });
  });
  app.put(`${base}/favorites/:productId`,async req=>{const u=await user(req);const {productId}=params(req);const [p]=await q`select p.id from products p join stores s on s.id=p.store_id where p.id=${productId} and p.status='PUBLISHED' and s.status='ACTIVE'`;if(!p)fail(404,'محصول یافت نشد.');await q`insert into marketplace_favorites(user_id,product_id) values(${u.id},${productId}) on conflict do nothing`;return {ok:true};});
  app.delete(`${base}/favorites/:productId`,async req=>{const u=await user(req);const {productId}=params(req);await q`delete from marketplace_favorites where user_id=${u.id} and product_id=${productId}`;return {ok:true};});
  app.get(`${base}/favorites`,async req=>{const u=await user(req);return {data:await q`select p.id,p.slug,p.name,s.slug as "storeSlug" from marketplace_favorites f join products p on p.id=f.product_id and p.status='PUBLISHED' join stores s on s.id=p.store_id and s.status='ACTIVE' where f.user_id=${u.id} order by f.created_at desc limit 200`};});
  app.post(`${base}/seller/stores/:storeId/articles`,async(req,reply)=>{const {storeId}=params(req);const {u}=await member(req,storeId);const b=parse(z.object({title:text(180),body:text(12000)}),req.body);const [a]=await q`insert into marketplace_articles(store_id,author_id,title,body) values(${storeId},${u.id},${b.title},${b.body}) returning id,status`;return reply.code(201).send(a);});
  app.get(`${base}/stores/:storeId/content`,async req=>{const {storeId}=params(req);return {
    articles:await q`select a.id,a.title,a.body,a.created_at as "createdAt" from marketplace_articles a join stores s on s.id=a.store_id and s.status='ACTIVE' where a.store_id=${storeId} and a.status='PUBLISHED' order by a.created_at desc limit 30`,
    reviews:await q`select r.id,r.rating,r.body,r.created_at as "createdAt" from marketplace_reviews r join stores s on s.id=r.store_id and s.status='ACTIVE' where r.store_id=${storeId} and r.status='PUBLISHED' order by r.created_at desc limit 50`};});
  app.post(`${base}/stores/:storeId/reviews`,async(req,reply)=>{
    const {storeId}=params(req);const u=await user(req);const b=parse(z.object({rating:z.number().int().min(1).max(5),body:text(2000)}),req.body);
    const [eligible]=await q`select so.id from marketplace_seller_orders so join marketplace_orders o on o.id=so.order_id join marketplace_delivery_evidence d on d.seller_order_id=so.id
      where so.store_id=${storeId} and o.user_id=${u.id} and so.status='DELIVERED' and not exists(select 1 from store_members m where m.store_id=${storeId} and m.user_id=${u.id}) order by so.created_at desc limit 1`;
    if(!eligible)fail(403,'نظر معتبر فقط پس از خرید و تحویل مستقل ثبت می‌شود.');
    const [r]=await q`insert into marketplace_reviews(store_id,user_id,seller_order_id,rating,body) values(${storeId},${u.id},${eligible.id},${b.rating},${b.body}) on conflict(user_id,seller_order_id) do update set rating=excluded.rating,body=excluded.body,status='PENDING' returning id,status`;return reply.code(201).send(r);
  });
  app.get(`${base}/admin/queue`,async req=>{await admin(req);return {products:await q`select p.id,p.name,p.status,s.name as "storeName",(s.identity_evidence_ref is not null) as "identityEvidence" from products p join stores s on s.id=p.store_id where p.status='DRAFT' order by p.created_at limit 100`,articles:await q`select id,title,body from marketplace_articles where status='PENDING' limit 100`,reviews:await q`select id,rating,body from marketplace_reviews where status='PENDING' limit 100`};});
  app.post(`${base}/admin/moderate`,async req=>{
    const b=parse(z.object({kind:z.enum(['product','article','review','featured']),id,status:z.enum(['PUBLISHED','REJECTED']),password:text(128),reason:text(500),until:z.iso.datetime().optional()}),req.body);
    const a=await reauth(req,b.password);if(!a||!['SUPER_ADMIN','MARKETPLACE_ADMIN'].includes(a.role))fail(403,'تأیید هویت مدیر لازم است.');
    return q.begin(async tx=>{
      if(b.kind==='product'){
        const [p]=await tx`select p.id from products p join stores s on s.id=p.store_id where p.id=${b.id} and s.status='ACTIVE' and s.identity_evidence_ref is not null`;
        if(!p)fail(409,'انتشار نیازمند فروشگاه فعال و احراز هویت مستند است.');
        await tx`update products set status=${b.status==='PUBLISHED'?'PUBLISHED':'DRAFT'},updated_at=now() where id=${b.id}`;
      } else if(b.kind==='featured'){
        if(!b.until||new Date(b.until)<=new Date())fail(400,'پایان نمایش لازم است.');
        await tx`update stores set featured_until=${b.status==='PUBLISHED'?b.until:null} where id=${b.id} and status='ACTIVE'`;
      } else if(b.kind==='article')await tx`update marketplace_articles set status=${b.status} where id=${b.id}`;
      else await tx`update marketplace_reviews set status=${b.status} where id=${b.id}`;
      await tx`insert into marketplace_audit(actor_id,action,entity_id,details) values(${a.userId},${'MODERATE_'+b.kind},${b.id},${JSON.stringify({reason:b.reason,status:b.status})}::jsonb)`;return {ok:true};
    });
  });
  app.post(`${base}/custom-requests`,async(req,reply)=>{
    const u=await user(req);const b=parse(z.object({storeId:id,referenceKey:text(300),desiredOutput:text(2000),dimensions:text(300),material:text(300),quantity:z.number().int().min(1).max(999)}),req.body);
    // Opaque private-upload reference only; never accept a public URL or another account's key.
    if(!b.referenceKey.startsWith(`private/${u.id}/`)||b.referenceKey.includes('..')||b.referenceKey.includes('://'))fail(400,'فایل مرجع خصوصی متعلق به این حساب لازم است.');
    const mediaId=parse(id,b.referenceKey.split('/')[2]);if(b.referenceKey!==`private/${u.id}/${mediaId}`)fail(400,'مرجع فایل معتبر نیست.');const [media]=await q`select id from marketplace_media where id=${mediaId} and owner_id=${u.id}`;if(!media)fail(400,'فایل مرجع معتبر لازم است.');
    const [s]=await q`select id from stores where id=${b.storeId} and status='ACTIVE'`;if(!s)fail(404,'فروشگاه یافت نشد.');
    const [r]=await q`insert into marketplace_custom_requests(buyer_id,store_id,reference_key,desired_output,dimensions,material,quantity) values(${u.id},${b.storeId},${b.referenceKey},${b.desiredOutput},${b.dimensions},${b.material},${b.quantity}) returning id`;return reply.code(201).send(r);
  });
  app.get(`${base}/custom-requests`,async req=>{const u=await user(req);return {data:await q`select r.id,r.store_id as "storeId",r.desired_output as "desiredOutput",r.dimensions,r.material,r.quantity,'/api/marketplace/v21/media/'||split_part(r.reference_key,'/',3) as "referenceUrl",(r.buyer_id=${u.id}) as "canAccept",exists(select 1 from store_members sm where sm.store_id=r.store_id and sm.user_id=${u.id} and sm.role in ('OWNER','MANAGER')) as "canQuote",(select jsonb_agg(jsonb_build_object('id',v.id,'version',v.version,'priceRial',v.price_rial,'productionDays',v.production_days,'expiresAt',v.expires_at,'acceptedAt',v.accepted_at) order by v.version desc) from marketplace_quotes v where v.request_id=r.id) as quotes from marketplace_custom_requests r where r.buyer_id=${u.id} or exists(select 1 from store_members m where m.store_id=r.store_id and m.user_id=${u.id}) order by r.created_at desc limit 100`};});
  app.post(`${base}/custom-requests/:requestId/quotes`,async(req,reply)=>{
    const {requestId}=params(req);const b=parse(z.object({priceRial:price,productionDays:z.number().int().min(1).max(365),expiresAt:z.iso.datetime()}),req.body);
    const [r]=await q`select store_id from marketplace_custom_requests where id=${requestId}`;if(!r)fail(404,'درخواست یافت نشد.');await member(req,r.store_id,['OWNER','MANAGER']);
    if(new Date(b.expiresAt)<=new Date())fail(400,'مهلت پیشنهاد معتبر نیست.');
    return q.begin(async tx=>{await tx`select id from marketplace_custom_requests where id=${requestId} for update`;const [last]=await tx`select version,accepted_at from marketplace_quotes where request_id=${requestId} order by version desc limit 1`;if(last?.accepted_at)fail(409,'پیشنهاد پذیرفته‌شده قابل تغییر نیست.');const [quote]=await tx`insert into marketplace_quotes(request_id,version,price_rial,production_days,expires_at) values(${requestId},${(last?.version??0)+1},${b.priceRial},${b.productionDays},${b.expiresAt}) returning id,version`;return reply.code(201).send(quote);});
  });
  app.post(`${base}/quotes/:quoteId/accept`,async req=>{
    const u=await user(req);const {quoteId}=params(req);
    return q.begin(async tx=>{const [row]=await tx`select v.*,r.buyer_id from marketplace_quotes v join marketplace_custom_requests r on r.id=v.request_id where v.id=${quoteId} for update of r,v`;if(!row||row.buyer_id!==u.id)fail(404,'پیشنهاد یافت نشد.');const [latest]=await tx`select id from marketplace_quotes where request_id=${row.request_id} order by version desc limit 1`;if(latest?.id!==quoteId||new Date(row.expires_at)<=new Date())fail(409,'پیشنهاد منقضی یا جایگزین شده است.');await tx`update marketplace_quotes set accepted_at=coalesce(accepted_at,now()) where id=${quoteId}`;return {ok:true,version:row.version};});
  });
}
