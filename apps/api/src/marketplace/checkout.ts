import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import {sqlClient as q} from '../db/client.js';
import {requireAuthUser} from '../auth/session.js';
import {config} from '../config.js';
const uuid=z.string().uuid();
const input=z.object({items:z.array(z.object({productId:uuid,variantId:uuid,quoteId:uuid.optional(),quantity:z.number().int().min(1).max(999)})).min(1).max(50)});
function fail(statusCode:number,message:string):never{throw Object.assign(new Error(message),{statusCode});}
async function buyer(req:FastifyRequest){const u=await requireAuthUser(req);if(!u)fail(401,'ورود به حساب لازم است.');const [v]=await q`select u.email_verified,b.mobile_verified_at,b.evidence_ref from users u left join marketplace_buyer_verifications b on b.user_id=u.id where u.id=${u.id}`;if(!v?.email_verified||!v.mobile_verified_at||!v.evidence_ref)fail(403,'تأیید ایمیل و موبایل پیش از خرید لازم است.');return u;}
export async function registerCheckoutV21(app:FastifyInstance){
 const base='/api/v1/marketplace/v21';
 app.post(`${base}/checkout/preview`,async(req,reply)=>{
  if(config.NODE_ENV==='production')return reply.code(503).send({error:{code:'PURCHASE_NOT_ENABLED',message:'خرید پس از آماده‌شدن خدمات پرداخت فعال می‌شود.'}});
  const u=await buyer(req);const b=input.safeParse(req.body);if(!b.success)fail(400,'اقلام سبد معتبر نیستند.');
  if(new Set(b.data.items.map(v=>v.variantId)).size!==b.data.items.length)fail(400,'تنوع تکراری در سبد است.');
  const rows=await q`select p.id as "productId",p.product_type as "productType",p.store_id as "storeId",v.id as "variantId",v.per_order_limit as "perOrderLimit",case when now()>=v.discount_starts_at and now()<v.discount_ends_at then v.discount_rial else v.price_rial end as price,i.quantity_on_hand-i.quantity_reserved as available from products p join stores s on s.id=p.store_id and s.status='ACTIVE' join product_variants v on v.product_id=p.id and v.status='ACTIVE' join inventory i on i.variant_id=v.id where p.status='PUBLISHED' and v.id in ${q(b.data.items.map(v=>v.variantId))}`;
  const items=[];
  for(const item of b.data.items){const row=rows.find(r=>r.variantId===item.variantId&&r.productId===item.productId);if(!row||item.quantity>Math.min(row.available,row.perOrderLimit))fail(409,'تنوع یا تعداد درخواستی قابل خرید نیست.');
   let acceptedPrice=Number(row.price);
   if(row.productType==='CUSTOM_DESIGN'){
    if(!item.quoteId)fail(409,'پیشنهاد پذیرفته‌شده لازم است.');
    const [v]=await q`select v.price_rial,r.quantity from marketplace_quotes v join marketplace_custom_requests r on r.id=v.request_id where v.id=${item.quoteId} and r.buyer_id=${u.id} and r.store_id=${row.storeId} and v.accepted_at is not null and v.expires_at>now() and v.order_id is null and v.version=(select max(version) from marketplace_quotes where request_id=v.request_id)`;
    if(!v||v.quantity!==item.quantity)fail(409,'پیشنهاد یا تعداد آن معتبر نیست.');acceptedPrice=Number(v.price_rial);
   }else if(item.quoteId)fail(400,'پیشنهاد اختصاصی فقط برای کالای اختصاصی است.');
   items.push({...item,expectedPriceRial:acceptedPrice});
  }
  const storeIds=[...new Set(rows.map(r=>r.storeId))];
  const profiles=await q`select store_id as "storeId",method,fee_rial as "feeRial",dispatch_days as "dispatchDays",version from marketplace_shipping_profiles where store_id in ${q(storeIds)}`;
  if(profiles.length!==storeIds.length)fail(409,'روش و هزینهٔ ارسال همهٔ فروشگاه‌ها باید مشخص باشد.');
  const shipping=profiles.map(p=>({...p,feeRial:Number(p.feeRial),coverageIncluded:false}));
  const [snapshot]=await q`insert into marketplace_checkout_snapshots(user_id,items,shipping) values(${u.id},${JSON.stringify(items)}::jsonb,${JSON.stringify(shipping)}::jsonb) returning id,expires_at as "expiresAt"`;
  const merchandiseRial=items.reduce((n,v)=>n+v.expectedPriceRial*v.quantity,0);return reply.code(201).send({...snapshot,items,shipping,merchandiseRial,totalRial:merchandiseRial+shipping.reduce((n,s)=>n+s.feeRial,0)});
 });
 app.post(`${base}/orders`,async(req,reply)=>{
  if(config.NODE_ENV==='production')return reply.code(503).send({error:{code:'PURCHASE_NOT_ENABLED'}});
  const u=await buyer(req);const b=z.object({snapshotId:uuid,idempotencyKey:z.string().min(12).max(128),address:z.record(z.string(),z.unknown())}).safeParse(req.body);if(!b.success)fail(400,'اطلاعات سفارش معتبر نیست.');
  const [s]=await q`select id,items from marketplace_checkout_snapshots where id=${b.data.snapshotId} and user_id=${u.id}`;if(!s)fail(404,'پیش‌فاکتور یافت نشد.');
  const r=await app.inject({method:'POST',url:'/api/v1/marketplace/orders',headers:{authorization:req.headers.authorization??''},payload:{idempotencyKey:b.data.idempotencyKey,address:b.data.address,items:s.items,checkoutSnapshotId:s.id}});
  return reply.code(r.statusCode).send(r.json());
 });
}
