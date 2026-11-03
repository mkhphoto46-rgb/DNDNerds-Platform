import type {FastifyInstance} from 'fastify';
import {z} from 'zod';
import {sqlClient as q} from '../db/client.js';
import {requireAuthUser} from '../auth/session.js';
import {getAdmin,reauth} from '../routes/admin.js';

function fail(statusCode:number,message:string):never{throw Object.assign(new Error(message),{statusCode});}
function parse<T>(schema:z.ZodType<T>,value:unknown):T{const result=schema.safeParse(value);if(!result.success)fail(400,'اطلاعات واردشده معتبر نیست.');return result.data;}
const uuid=z.string().uuid();
const pagination=z.object({limit:z.coerce.number().int().min(1).max(20).default(20),cursor:z.string().max(500).optional()});
function decode(cursor?:string):{createdAt:string;id:string}|null{if(!cursor)return null;try{return z.object({createdAt:z.iso.datetime({offset:true}),id:uuid}).parse(JSON.parse(Buffer.from(cursor,'base64url').toString('utf8')));}catch{fail(400,'نشانگر صفحه معتبر نیست.');}}
function next(rows:Record<string,unknown>[],limit:number){const last=rows[Math.min(rows.length,limit)-1];return rows.length>limit&&last?Buffer.from(JSON.stringify({createdAt:last.createdAt,id:last.id})).toString('base64url'):null;}
// Preserve PostgreSQL microseconds in the cursor; JS Date truncation can skip rows.
const fields=q`c.id,c.kind,c.body,c.rating,c.status,to_char(c.created_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as "createdAt",coalesce(nullif(u.username,''),'کاربر') as "authorName",(c.kind='REVIEW') as "verifiedPurchase"`;
function eligible(productId:string,userId:string){return q`select d.id from marketplace_delivery_evidence d join marketplace_seller_orders so on so.id=d.seller_order_id join marketplace_orders o on o.id=so.order_id join marketplace_order_items oi on oi.seller_order_id=so.id join stores s on s.id=so.store_id join seller_profiles sp on sp.id=s.seller_profile_id where oi.product_id=${productId} and o.user_id=${userId} and so.status='DELIVERED' and d.delivered_at is not null and length(btrim(d.evidence_ref))>0 and d.reviewer_id<>${userId} and d.reviewer_id<>sp.user_id and sp.user_id<>${userId} and not exists(select 1 from store_members m where m.store_id=s.id and m.user_id in (${userId},d.reviewer_id)) order by d.confirmed_at desc,d.id limit 1`;}
export async function registerProductCommunity(app:FastifyInstance){
 const base='/api/v1/marketplace/v21/products/:productId/community';
 app.get(base,async(req,reply)=>{
  reply.header('cache-control','private, no-store');
  const {productId}=parse(z.object({productId:uuid}),req.params),page=parse(pagination,req.query),cursor=decode(page.cursor);
  const [product]=await q`select p.id from products p join stores s on s.id=p.store_id where p.id=${productId} and p.status='PUBLISHED' and s.status='ACTIVE'`;if(!product)fail(404,'محصول یافت نشد.');
  const viewer=await requireAuthUser(req);
  const rows=await q`select ${fields} from marketplace_product_community c join users u on u.id=c.user_id where c.product_id=${productId} and c.status='PUBLISHED' and (${cursor===null} or (c.created_at,c.id)<(${cursor?.createdAt??null}::timestamptz,${cursor?.id??null}::uuid)) order by c.created_at desc,c.id desc limit ${page.limit+1}`;
  const stats=await q`select rating,count(*)::int count from marketplace_product_community where product_id=${productId} and kind='REVIEW' and status='PUBLISHED' group by rating`;
  const histogram:Record<string,number>={'1':0,'2':0,'3':0,'4':0,'5':0};let count=0,total=0;for(const r of stats){histogram[String(r.rating)]=r.count;count+=r.count;total+=r.count*r.rating;}
  const evidence=viewer?await eligible(productId,viewer.id):[];
  const entries=viewer?await q`select id,kind,body,rating,status from marketplace_product_community where product_id=${productId} and user_id=${viewer.id} order by kind`:[];
  return {data:rows.slice(0,page.limit),rating:{count,average:count?total/count:0,histogram},viewer:{authenticated:!!viewer,canComment:!!viewer,canReview:evidence.length>0,entries},nextCursor:next(rows,page.limit)};
 });
 app.post(base,async(req,reply)=>{
  const viewer=await requireAuthUser(req);if(!viewer)fail(401,'ورود به حساب لازم است.');
  const {productId}=parse(z.object({productId:uuid}),req.params);
  const body=parse(z.discriminatedUnion('kind',[z.object({kind:z.literal('COMMENT'),body:z.string().trim().min(3).max(2000)}).strict(),z.object({kind:z.literal('REVIEW'),body:z.string().trim().min(3).max(2000),rating:z.number().int().min(1).max(5)}).strict()]),req.body);
  const result=await q.begin(async tx=>{
   await tx`select pg_advisory_xact_lock(hashtextextended(${'product-community:'+viewer.id},0))`;
   const [product]=await tx`select p.id from products p join stores s on s.id=p.store_id where p.id=${productId} and p.status='PUBLISHED' and s.status='ACTIVE' for share of p,s`;if(!product)fail(404,'محصول یافت نشد.');
   const [daily]=await tx`select count(*)::int count from marketplace_product_community_submissions where user_id=${viewer.id} and created_at>=date_trunc('day',now() at time zone 'UTC') at time zone 'UTC'`;
   if(daily!.count>=20)fail(429,'سقف روزانهٔ ثبت دیدگاه پر شده است.');
   const evidence=body.kind==='REVIEW'?await tx`${eligible(productId,viewer.id)}`:[];if(body.kind==='REVIEW'&&!evidence[0])fail(403,'امتیاز خرید فقط پس از تحویل مستقل همین محصول ثبت می‌شود.');
   const [entry]=await tx`insert into marketplace_product_community(product_id,user_id,kind,body,rating,delivery_evidence_id) values(${productId},${viewer.id},${body.kind},${body.body},${body.kind==='REVIEW'?body.rating:null},${evidence[0]?.id??null}) on conflict(product_id,user_id,kind) do update set body=excluded.body,rating=excluded.rating,delivery_evidence_id=excluded.delivery_evidence_id,status='PENDING',updated_at=now() returning id,status`;
   await tx`insert into marketplace_product_community_submissions(user_id,entry_id) values(${viewer.id},${entry!.id})`;return entry;
  });return reply.code(201).send(result);
 });
 const adminBase='/api/v1/admin/marketplace/product-community';
 app.get(adminBase+'/queue',async req=>{
  const admin=await getAdmin(req);if(!admin||!['SUPER_ADMIN','MARKETPLACE_ADMIN'].includes(admin.role))fail(403,'دسترسی مدیر لازم است.');
  const page=parse(pagination,req.query),cursor=decode(page.cursor);
  const rows=await q`select ${fields},c.product_id as "productId",p.name as "productName",s.name as "storeName" from marketplace_product_community c join users u on u.id=c.user_id join products p on p.id=c.product_id join stores s on s.id=p.store_id where c.status='PENDING' and (${cursor===null} or (c.created_at,c.id)<(${cursor?.createdAt??null}::timestamptz,${cursor?.id??null}::uuid)) order by c.created_at desc,c.id desc limit ${page.limit+1}`;
  return {data:rows.slice(0,page.limit),nextCursor:next(rows,page.limit)};
 });
 app.post(adminBase+'/:entryId/moderate',async req=>{
  const {entryId}=parse(z.object({entryId:uuid}),req.params),body=parse(z.object({status:z.enum(['PUBLISHED','REJECTED']),password:z.string().min(1).max(128),reason:z.string().trim().min(3).max(500)}),req.body);
  const admin=await reauth(req,body.password);if(!admin||!['SUPER_ADMIN','MARKETPLACE_ADMIN'].includes(admin.role))fail(403,'رمز یا دسترسی مدیر معتبر نیست.');
  return q.begin(async tx=>{
   const [old]=await tx`select id,status from marketplace_product_community where id=${entryId} for update`;if(!old)fail(404,'دیدگاه یافت نشد.');
   await tx`update marketplace_product_community set status=${body.status},updated_at=now() where id=${entryId}`;
   await tx`insert into marketplace_audit(actor_id,action,entity_id,details) values(${admin.userId},'PRODUCT_COMMUNITY_MODERATE',${entryId},${JSON.stringify({from:old.status,to:body.status,reason:body.reason})}::jsonb)`;
   return {ok:true,id:entryId,status:body.status};
  });
 });
}
