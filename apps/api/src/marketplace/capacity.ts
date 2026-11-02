import type {FastifyInstance,FastifyRequest} from 'fastify';
import {z} from 'zod';
import {sqlClient as q} from '../db/client.js';
import {requireAuthUser} from '../auth/session.js';
const uuid=z.string().uuid();
const reason=z.string().trim().min(3).max(500);
const paramsSchema=z.object({storeId:uuid,variantId:uuid,windowId:uuid.optional()});
function fail(statusCode:number,message:string):never{throw Object.assign(new Error(message),{statusCode});}
function parse<T>(schema:z.ZodType<T>,value:unknown):T{const b=schema.safeParse(value);if(!b.success)fail(400,'اطلاعات بازهٔ ساخت معتبر نیست.');return b.data;}
async function access(req:FastifyRequest,storeId:string,variantId:string){
 const u=await requireAuthUser(req);if(!u)fail(401,'ورود به حساب لازم است.');
 const[s]=await q`select s.status,m.role from stores s join store_members m on m.store_id=s.id where s.id=${storeId} and m.user_id=${u.id}`;
 if(!s||!['OWNER','MANAGER','PRODUCT_EDITOR'].includes(s.role)||['SUSPENDED','ARCHIVED'].includes(s.status))fail(403,'دسترسی مدیریت ظرفیت این فروشگاه مجاز نیست.');
 const[v]=await q`select v.id,p.production_days,p.product_type from product_variants v join products p on p.id=v.product_id where v.id=${variantId} and p.store_id=${storeId}`;
 if(!v)fail(404,'تنوع یافت نشد.');return {u,v};
}
export async function registerCapacity(app:FastifyInstance){
 const base='/api/v1/marketplace/v21';
 app.get(`${base}/variants/:variantId/capacity-windows`,async req=>{
  const{variantId}=parse(z.object({variantId:uuid}),req.params);
  const[v]=await q`select v.id from product_variants v join products p on p.id=v.product_id join stores s on s.id=p.store_id
    where v.id=${variantId} and v.status='ACTIVE' and p.status='PUBLISHED' and s.status='ACTIVE'`;
  if(!v)fail(404,'تنوع منتشرشده یافت نشد.');
  return {data:await q`select id,version,starts_at as "startsAt",ends_at as "endsAt",order_cutoff_at as "orderCutoffAt",capacity_total-reserved-committed as available
    from marketplace_capacity_windows where variant_id=${variantId} and status='OPEN' and order_cutoff_at>now() order by starts_at,id limit 24`};
 });
 const path=`${base}/seller/stores/:storeId/variants/:variantId/capacity-windows`;
 app.get(path,async req=>{const{storeId,variantId}=parse(paramsSchema,req.params);await access(req,storeId,variantId);
  return {data:await q`select id,version,status,starts_at as "startsAt",ends_at as "endsAt",order_cutoff_at as "orderCutoffAt",capacity_total as capacity,reserved,committed
   from marketplace_capacity_windows where variant_id=${variantId} order by starts_at desc,id limit 100`};});
 app.post(path,async(req,reply)=>{
  const{storeId,variantId}=parse(paramsSchema,req.params);const{u,v}=await access(req,storeId,variantId);
  const b=parse(z.object({startsAt:z.iso.datetime(),endsAt:z.iso.datetime(),orderCutoffAt:z.iso.datetime(),capacity:z.number().int().min(1).max(1_000_000),reason}).strict(),req.body);
  if(v.product_type==='READY_TO_SHIP')fail(409,'کالای آمادهٔ ارسال به بازهٔ ساخت نیاز ندارد.');
  const start=new Date(b.startsAt),end=new Date(b.endsAt),cutoff=new Date(b.orderCutoffAt);
  if(cutoff<=new Date()||cutoff>start||end<=start||end.getTime()-start.getTime()<Number(v.production_days)*86400000)fail(400,'زمان‌ها با مهلت ثبت و مدت ساخت محصول سازگار نیستند.');
  const result=await q.begin(async tx=>{
   await tx`select pg_advisory_xact_lock(hashtextextended(${'capacity-config:'+variantId},0))`;
   const[count]=await tx`select count(*)::int n from marketplace_capacity_windows where variant_id=${variantId} and status='OPEN' and order_cutoff_at>now()`;
   if(Number(count?.n)>=24)fail(409,'بیش از ۲۴ بازهٔ باز برای یک تنوع مجاز نیست.');
   const[overlap]=await tx`select id from marketplace_capacity_windows where variant_id=${variantId} and status='OPEN' and tstzrange(starts_at,ends_at,'[)')&&tstzrange(${b.startsAt}::timestamptz,${b.endsAt}::timestamptz,'[)') limit 1`;
   if(overlap)fail(409,'این بازه با برنامهٔ فعال دیگری هم‌پوشانی دارد.');
   const[w]=await tx`insert into marketplace_capacity_windows(variant_id,starts_at,ends_at,order_cutoff_at,capacity_total,created_by)
    values(${variantId},${b.startsAt},${b.endsAt},${b.orderCutoffAt},${b.capacity},${u.id}) returning id,version`;
   await tx`insert into marketplace_audit(actor_id,action,entity_id,details) values(${u.id},'CAPACITY_WINDOW_CREATED',${w!.id},${JSON.stringify({reason:b.reason,variantId,capacity:b.capacity})}::jsonb)`;
   return w;
  });return reply.code(201).send(result);
 });
 app.patch(path+'/:windowId',async req=>{
  const{storeId,variantId,windowId}=parse(paramsSchema,req.params);const{u}=await access(req,storeId,variantId);
  const b=parse(z.object({expectedVersion:z.number().int().min(1),capacity:z.number().int().min(1).max(1_000_000).optional(),status:z.enum(['OPEN','CLOSED']).optional(),reason}).strict().refine(v=>v.capacity!==undefined||v.status!==undefined),req.body);
  return q.begin(async tx=>{
   await tx`select pg_advisory_xact_lock(hashtextextended(${'capacity-config:'+variantId},0))`;
   const[w]=await tx`select * from marketplace_capacity_windows where id=${windowId!} and variant_id=${variantId} for update`;
   if(!w)fail(404,'بازه یافت نشد.');
   if(w.version!==b.expectedVersion)fail(409,'نسخهٔ بازه تغییر کرده است؛ دوباره بررسی کنید.');
   if((b.capacity??w.capacity_total)<w.reserved+w.committed)fail(409,'ظرفیت از تعهدهای رزروشده و پرداخت‌شده کمتر نمی‌شود.');
   if(b.status==='OPEN'){
    if(w.status!=='OPEN'){
      const[count]=await tx`select count(*)::int n from marketplace_capacity_windows where variant_id=${variantId} and status='OPEN' and order_cutoff_at>now()`;
      if(Number(count?.n)>=24)fail(409,'بیش از ۲۴ بازهٔ باز برای یک تنوع مجاز نیست.');
    }
    const[overlap]=await tx`select id from marketplace_capacity_windows where variant_id=${variantId} and id<>${windowId!} and status='OPEN' and tstzrange(starts_at,ends_at,'[)')&&tstzrange(${String(w.starts_at)}::timestamptz,${String(w.ends_at)}::timestamptz,'[)') limit 1`;
    if(overlap)fail(409,'بازگشایی با برنامهٔ فعال دیگری هم‌پوشانی دارد.');
   }
   const[next]=await tx`update marketplace_capacity_windows set capacity_total=${b.capacity??w.capacity_total},status=${b.status??w.status},version=version+1 where id=${windowId!} returning id,version`;
   await tx`insert into marketplace_audit(actor_id,action,entity_id,details) values(${u.id},'CAPACITY_WINDOW_CHANGED',${windowId!},${JSON.stringify({reason:b.reason,fromVersion:w.version,toVersion:next!.version})}::jsonb)`;
   return next;
  });
 });
}
