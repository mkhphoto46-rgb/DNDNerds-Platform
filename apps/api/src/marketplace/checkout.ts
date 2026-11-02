import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import {sqlClient as q} from '../db/client.js';
import {requireAuthUser} from '../auth/session.js';
import {config} from '../config.js';
const uuid=z.string().uuid();
const input=z.object({items:z.array(z.object({productId:uuid,variantId:uuid,quoteId:uuid.optional(),capacityWindowId:uuid.optional(),expectedCapacityVersion:z.number().int().min(1).optional(),quantity:z.number().int().min(1).max(999)})).min(1).max(50)});
type PreviewItem=z.infer<typeof input>['items'][number]&{storeId:string;storeName:string;storeSlug:string;productName:string;variantName:string;expectedPriceRial:number;capacityWindowSnapshot?:Record<string,unknown>};
function fail(statusCode:number,message:string):never{throw Object.assign(new Error(message),{statusCode});}
async function buyer(req:FastifyRequest){const u=await requireAuthUser(req);if(!u)fail(401,'ورود به حساب لازم است.');const [v]=await q`select u.email_verified,b.mobile_verified_at,b.evidence_ref from users u left join marketplace_buyer_verifications b on b.user_id=u.id where u.id=${u.id}`;if(!v?.email_verified||!v.mobile_verified_at||!v.evidence_ref)fail(403,'تأیید ایمیل و موبایل پیش از خرید لازم است.');return u;}
export async function registerCheckoutV21(app:FastifyInstance){
 const base='/api/v1/marketplace/v21';
 app.post(`${base}/checkout/preview`,async(req,reply)=>{
  if(config.NODE_ENV==='production')return reply.code(503).send({error:{code:'PURCHASE_NOT_ENABLED',message:'خرید پس از آماده‌شدن خدمات پرداخت فعال می‌شود.'}});
  const u=await buyer(req);const b=input.safeParse(req.body);if(!b.success)fail(400,'اقلام سبد معتبر نیستند.');
  if(new Set(b.data.items.map(v=>v.variantId)).size!==b.data.items.length)fail(400,'تنوع تکراری در سبد است.');
  const rows=await q`select p.id as "productId",p.name as "productName",v.name as "variantName",s.name as "storeName",s.slug as "storeSlug",p.product_type as "productType",p.production_days as "productionDays",p.store_id as "storeId",v.id as "variantId",v.per_order_limit as "perOrderLimit",case when now()>=v.discount_starts_at and now()<v.discount_ends_at then v.discount_rial else v.price_rial end as price,i.quantity_on_hand-i.quantity_reserved as available from products p join stores s on s.id=p.store_id and s.status='ACTIVE' join product_variants v on v.product_id=p.id and v.status='ACTIVE' join inventory i on i.variant_id=v.id where p.status='PUBLISHED' and v.id in ${q(b.data.items.map(v=>v.variantId))}`;
  const items:PreviewItem[]=[];
  for(const item of b.data.items){const row=rows.find(r=>r.variantId===item.variantId&&r.productId===item.productId);if(!row||item.quantity>Math.min(row.available,row.perOrderLimit))fail(409,'تنوع یا تعداد درخواستی قابل خرید نیست.');
   let acceptedPrice=Number(row.price);
   let productionDays=Number(row.productionDays);
   if(row.productType==='CUSTOM_DESIGN'){
    if(!item.quoteId)fail(409,'پیشنهاد پذیرفته‌شده لازم است.');
    const [v]=await q`select v.price_rial,v.production_days,r.quantity from marketplace_quotes v join marketplace_custom_requests r on r.id=v.request_id where v.id=${item.quoteId} and r.buyer_id=${u.id} and r.store_id=${row.storeId} and v.accepted_at is not null and v.expires_at>now() and v.order_id is null and v.version=(select max(version) from marketplace_quotes where request_id=v.request_id)`;
    if(!v||v.quantity!==item.quantity)fail(409,'پیشنهاد یا تعداد آن معتبر نیست.');acceptedPrice=Number(v.price_rial);productionDays=Number(v.production_days);
   }else if(item.quoteId)fail(400,'پیشنهاد اختصاصی فقط برای کالای اختصاصی است.');
   let window:Record<string,unknown>|undefined;
   if(row.productType==='READY_TO_SHIP'){if(item.capacityWindowId)fail(400,'کالای آماده به بازهٔ ساخت نیاز ندارد.');}
   else{
    if(!item.capacityWindowId)fail(409,'انتخاب بازهٔ ساخت لازم است.');
    [window]=await q`select id,version,starts_at,ends_at,order_cutoff_at,capacity_total-reserved-committed available from marketplace_capacity_windows where id=${item.capacityWindowId} and variant_id=${item.variantId} and status='OPEN' and order_cutoff_at>now()`;
    if(!window||Number(window.available)<item.quantity||(item.expectedCapacityVersion!==undefined&&item.expectedCapacityVersion!==Number(window.version))||
      new Date(String(window.ends_at)).getTime()-new Date(String(window.starts_at)).getTime()<productionDays*86400000)fail(409,'بازه یا ظرفیت ساخت تغییر کرده است.');
   }
   items.push({...item,storeId:row.storeId,storeName:row.storeName,storeSlug:row.storeSlug,productName:row.productName,variantName:row.variantName,expectedPriceRial:acceptedPrice,...(window?{expectedCapacityVersion:Number(window.version),capacityWindowSnapshot:{id:window.id,version:Number(window.version),startsAt:window.starts_at,endsAt:window.ends_at,orderCutoffAt:window.order_cutoff_at}}:{})});
  }
  const storeIds=[...new Set(rows.map(r=>r.storeId))];
  const profiles=await q`select store_id as "storeId",method,fee_rial as "feeRial",dispatch_days as "dispatchDays",version from marketplace_shipping_profiles where store_id in ${q(storeIds)}`;
  if(profiles.length!==storeIds.length)fail(409,'روش و هزینهٔ ارسال همهٔ فروشگاه‌ها باید مشخص باشد.');
  const shipping=profiles.map(p=>({storeId:String(p.storeId),method:String(p.method),dispatchDays:Number(p.dispatchDays),version:Number(p.version),feeRial:Number(p.feeRial),coverageIncluded:false}));
  const [snapshot]=await q`insert into marketplace_checkout_snapshots(user_id,items,shipping) values(${u.id},${JSON.stringify(items)}::jsonb,${JSON.stringify(shipping)}::jsonb) returning id,expires_at as "expiresAt"`;
  const merchandiseRial=items.reduce((n,v)=>n+v.expectedPriceRial*v.quantity,0);
  const totalRial=merchandiseRial+shipping.reduce((n,s)=>n+s.feeRial,0);
  const sellerOrders=shipping.map(s=>{const lines=items.filter(i=>i.storeId===s.storeId);const grossRial=lines.reduce((n,i)=>n+i.expectedPriceRial*i.quantity,0)+s.feeRial;
    return {storeId:s.storeId,storeName:lines[0]?.storeName,storeSlug:lines[0]?.storeSlug,grossToman:grossRial/10,shippingFeeToman:s.feeRial/10,shippingMethod:s.method,dispatchDays:s.dispatchDays,
      items:lines.map(i=>({...i,unitPriceToman:i.expectedPriceRial/10,lineTotalToman:i.expectedPriceRial*i.quantity/10}))};});
  return reply.code(201).send({...snapshot,mode:'SANDBOX',source:'postgresql',items,shipping,sellerOrders,merchandiseRial,totalRial,customerTotalToman:totalRial/10});
 });
 app.post(`${base}/orders`,async(req,reply)=>{
  if(config.NODE_ENV==='production')return reply.code(503).send({error:{code:'PURCHASE_NOT_ENABLED'}});
  const u=await buyer(req);const b=z.object({snapshotId:uuid,idempotencyKey:z.string().min(12).max(128),address:z.record(z.string(),z.unknown())}).safeParse(req.body);if(!b.success)fail(400,'اطلاعات سفارش معتبر نیست.');
  const [s]=await q`select id,items from marketplace_checkout_snapshots where id=${b.data.snapshotId} and user_id=${u.id}`;if(!s)fail(404,'پیش‌فاکتور یافت نشد.');
  const r=await app.inject({method:'POST',url:'/api/v1/marketplace/orders',headers:{authorization:req.headers.authorization??''},payload:{idempotencyKey:b.data.idempotencyKey,address:b.data.address,items:s.items,checkoutSnapshotId:s.id}});
  return reply.code(r.statusCode).send(r.json());
 });
}
