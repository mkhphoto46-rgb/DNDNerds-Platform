import type {FastifyInstance,FastifyRequest} from 'fastify';
import {z} from 'zod';
import {randomBytes,createHash} from 'node:crypto';
import {sqlClient as q} from '../db/client.js';
import {getAdmin,reauth} from './admin.js';
import {validProfileImage} from './profile-image.js';
import {processTableDeletion} from '../jobs/table-deletion.js';
import {notifyMembershipRevoked} from '../integrations/vtt-membership-revoked.js';
const base='/api/v1/admin/control';
const uuid=z.string().uuid();
const kind=z.enum(['tables','stores','products']);
const credentials=z.object({password:z.string().min(1).max(128),reason:z.string().trim().min(3).max(500),expectedVersion:z.string().min(1).max(80).optional()});
const text=(n:number)=>z.string().trim().min(1).max(n);
const tableFields=z.object({title:text(120).min(3),description:z.string().max(2000),system:text(80),language:text(60),playStyle:text(60),levelRange:text(60),schedule:text(160),capacity:z.number().int().min(2).max(8),status:z.enum(['DRAFT','PUBLISHED','CLOSED','HIDDEN']),visibility:z.enum(['PUBLIC','PRIVATE']),genres:z.array(z.enum(['فانتزی','ماجراجویی','وحشت','معمایی','علمی‌تخیلی','حماسی','طنز','تاریخی','نقش‌آفرینی','نبردمحور'])).max(4),imageData:z.string().nullable().refine(v=>validProfileImage(v,'campaign')),rotateInvite:z.boolean()}).partial();
const storeFields=z.object({name:text(180),slug:z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(120),description:z.string().max(800),category:text(120),status:z.enum(['DRAFT','PENDING_REVIEW','ACTIVE','SUSPENDED','ARCHIVED']),featured:z.boolean()}).partial();
const productFields=z.object({name:text(220),slug:z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(160),description:z.string().max(1200),category:text(120),productType:z.enum(['READY_TO_SHIP','MADE_TO_ORDER','CUSTOM_DESIGN']),brand:z.string().max(120),productionDays:z.number().int().min(0).max(365),status:z.enum(['DRAFT','PUBLISHED','ARCHIVED']),imageUrl:z.string().max(300).nullable()}).partial();
const variantFields=z.object({name:text(160),sku:text(100),status:z.enum(['ACTIVE','INACTIVE','ARCHIVED']),priceRial:z.number().int().min(1).max(2_000_000_000),stock:z.number().int().min(0).max(1_000_000),perOrderLimit:z.number().int().min(1).max(999),options:z.record(z.string().max(40),text(100)).refine(v=>Object.keys(v).length<=12),discountRial:z.number().int().min(1).max(2_000_000_000).nullable(),discountStartsAt:z.iso.datetime().nullable(),discountEndsAt:z.iso.datetime().nullable()}).partial();
function fail(statusCode:number,message:string):never{throw Object.assign(new Error(message),{statusCode});}
function parse<T>(schema:z.ZodType<T>,v:unknown){const p=schema.safeParse(v);if(!p.success)fail(400,'اطلاعات ارسالی معتبر نیست.');return p.data;}
function checkVersion(expected:string|undefined,actual:string){if(expected&&expected!==actual)fail(409,'این مورد پس از بازکردن صفحه تغییر کرده است؛ دوباره آن را باز کن.');}
async function writable(req:FastifyRequest,body:{password:string}){const a=await reauth(req,body.password);if(!a||!['SUPER_ADMIN','MARKETPLACE_ADMIN'].includes(a.role))fail(403,'رمز یا دسترسی مدیر معتبر نیست.');return a;}
async function write<T>(fn:()=>Promise<T>){try{return await fn();}catch(e){const code=(e as {code?:string}).code;if(code==='23505')fail(409,'نامک یا شناسهٔ تکراری است.');if(code==='23514'||code==='23503')fail(409,'این تغییر با داده‌های مرتبط یا محدودیت‌های ثبت‌شده سازگار نیست.');throw e;}}
async function audit(tx:any,actor:string,resource:string,id:string,action:string,reason:string,details:unknown={}){await tx`insert into marketplace_admin_audit_logs(admin_user_id,action,entity_type,entity_id,details) values(${actor},${action},${resource},${id},${JSON.stringify({reason,details})})`;}
async function revoke(tableId:string,reason:'table-hidden'|'table-closed'|'table-deleted',req:FastifyRequest){const rows=await q`select user_id from game_applications where table_id=${tableId} and status='ACCEPTED'`;notifyMembershipRevoked(rows.map(r=>({platformTableId:tableId,platformUserId:String(r.user_id),reason})),req.log);}
function tableView(row:any){const {invite_code_hash:_secret,...safe}=row;return safe;}
async function optionsAllowed(tx:any,category:string,options:Record<string,string>){const [row]=await tx`select attributes from marketplace_category_definitions where slug=${category}`;if(!row||Object.keys(options).some(k=>!Object.hasOwn(row.attributes??{},k)))fail(400,'دسته‌بندی یا مشخصات تنوع محصول معتبر نیست.');}
export async function registerAdminControl(app:FastifyInstance){
 app.get<{Params:{kind:string};Querystring:{q?:string;status?:string;page?:string}}>(`${base}/:kind`,async(req)=>{
  const admin=await getAdmin(req);if(!admin)fail(403,'دسترسی مدیر لازم است.');const type=parse(kind,req.params.kind);
  const filter=parse(z.object({q:z.string().trim().max(120).default(''),status:z.string().max(30).default(''),page:z.coerce.number().int().min(1).max(10000).default(1)}),req.query);const term='%'+filter.q+'%',offset=(filter.page-1)*20;
  let rows:any[],total:number;
  if(type==='tables'){
   rows=await q`select t.id,t.title,t.status,t.visibility,t.capacity,t.updated_at as "updatedAt",u.username as owner,(select count(*)::int from game_applications a where a.table_id=t.id and a.status='ACCEPTED') as seated,exists(select 1 from game_table_deletions d where d.table_id=t.id) as "deletionPending" from game_tables t join users u on u.id=t.host_user_id where (${!filter.q} or t.title ilike ${term} or t.id::text ilike ${term} or u.username ilike ${term}) and (${!filter.status} or t.status=${filter.status}) order by t.updated_at desc,t.id limit 20 offset ${offset}`;
   const [c]=await q`select count(*)::int n from game_tables t join users u on u.id=t.host_user_id where (${!filter.q} or t.title ilike ${term} or t.id::text ilike ${term} or u.username ilike ${term}) and (${!filter.status} or t.status=${filter.status})`;total=c!.n;
  }else if(type==='stores'){
   rows=await q`select s.id,s.name,s.slug,s.status,s.updated_at as "updatedAt",(s.featured_until>now()) as featured,(select count(*)::int from products p where p.store_id=s.id) as products from stores s where (${!filter.q} or s.name ilike ${term} or s.slug ilike ${term} or s.id::text ilike ${term}) and (${!filter.status} or s.status::text=${filter.status}) order by s.updated_at desc,s.id limit 20 offset ${offset}`;
   const [c]=await q`select count(*)::int n from stores s where (${!filter.q} or s.name ilike ${term} or s.slug ilike ${term} or s.id::text ilike ${term}) and (${!filter.status} or s.status::text=${filter.status})`;total=c!.n;
  }else{
   rows=await q`select p.id,p.name,p.slug,p.status,p.updated_at as "updatedAt",s.name as "storeName" from products p join stores s on s.id=p.store_id where (${!filter.q} or p.name ilike ${term} or p.slug ilike ${term} or p.id::text ilike ${term} or s.name ilike ${term}) and (${!filter.status} or p.status::text=${filter.status}) order by p.updated_at desc,p.id limit 20 offset ${offset}`;
   const [c]=await q`select count(*)::int n from products p join stores s on s.id=p.store_id where (${!filter.q} or p.name ilike ${term} or p.slug ilike ${term} or p.id::text ilike ${term} or s.name ilike ${term}) and (${!filter.status} or p.status::text=${filter.status})`;total=c!.n;
  }
  return {data:{rows,total,page:filter.page,limit:20,canWrite:admin.role!=='SUPPORT'}};
 });
 app.get<{Params:{kind:string;id:string}}>(`${base}/:kind/:id`,async req=>{
  if(!await getAdmin(req))fail(403,'دسترسی مدیر لازم است.');const type=parse(kind,req.params.kind),id=parse(uuid,req.params.id);
  if(type==='tables'){const [row]=await q`select t.*,t.updated_at::text as version,exists(select 1 from game_table_deletions d where d.table_id=t.id) as "deletionPending" from game_tables t where id=${id}`;if(!row)fail(404,'میز پیدا نشد.');return {data:tableView(row)};}
  if(type==='stores'){const [row]=await q`select id,name,slug,description,category,status,updated_at::text as version,(featured_until>now()) as featured from stores where id=${id}`;if(!row)fail(404,'فروشگاه پیدا نشد.');return {data:row};}
  const [row]=await q`select id,store_id,name,slug,description,category,updated_at::text as version,product_type,brand,production_days,status,image_url from products where id=${id}`;if(!row)fail(404,'محصول پیدا نشد.');const variants=await q`select v.id,v.name,v.sku,v.status,v.updated_at::text as version,v.price_rial as "priceRial",v.options,v.per_order_limit as "perOrderLimit",v.discount_rial as "discountRial",v.discount_starts_at as "discountStartsAt",v.discount_ends_at as "discountEndsAt",i.quantity_on_hand as stock,i.quantity_reserved as reserved from product_variants v join inventory i on i.variant_id=v.id where v.product_id=${id} order by v.created_at`;return {data:{...row,variants}};
 });
 app.patch<{Params:{kind:string;id:string}}>(`${base}/:kind/:id`,async req=>{
  const type=parse(kind,req.params.kind),id=parse(uuid,req.params.id);
  const schema=type==='tables'?tableFields:type==='stores'?storeFields:productFields;
  const b:any=parse<any>(schema.extend(credentials.shape).strict() as z.ZodType<any>,req.body),a=await writable(req,b);const {password:_password,reason,expectedVersion,...fields}=b;if(!Object.keys(fields).length)fail(400,'تغییری انتخاب نشده است.');
  let inviteCode:string|undefined;let shouldRevoke=false;
  await write(()=>q.begin(async tx=>{
   if(type==='tables'){
    const [row]=await tx`select *,updated_at::text as version from game_tables where id=${id} for update`;if(!row)fail(404,'میز پیدا نشد.');checkVersion(expectedVersion,row.version);if((await tx`select table_id from game_table_deletions where table_id=${id}`).length)fail(409,'حذف میز در حال انجام است.');
    const [count]=await tx`select count(*)::int n from game_applications where table_id=${id} and status='ACCEPTED'`;if(fields.capacity!==undefined&&fields.capacity<count!.n)fail(409,'ظرفیت کمتر از تعداد اعضای پذیرفته‌شده مجاز نیست.');
    const visibility=fields.visibility??row.visibility;const patch:any={updated_at:new Date().toISOString()};const map:Record<string,string>={title:'title',description:'description',system:'system',language:'language',playStyle:'play_style',levelRange:'level_range',schedule:'schedule',capacity:'capacity',status:'status',visibility:'visibility',imageData:'image_data'};for(const [k,v] of Object.entries(fields))if(map[k])patch[map[k]]=v;if(fields.genres)patch.genres=JSON.stringify(fields.genres);
    if(fields.rotateInvite&&visibility!=='PRIVATE')fail(400,'کد دعوت فقط برای میز دعوتی ساخته می‌شود.');if(visibility==='PRIVATE'&&(!row.invite_code_hash||fields.rotateInvite)){inviteCode=randomBytes(9).toString('base64url').toUpperCase();patch.invite_code_hash=createHash('sha256').update(inviteCode).digest('hex');}
    await tx`update game_tables set ${tx(patch)} where id=${id}`;shouldRevoke=row.status==='PUBLISHED'&&fields.status&&fields.status!=='PUBLISHED';await audit(tx,a.userId,'game_table',id,'ADMIN_EDIT_TABLE',reason,{fields:Object.keys(fields),beforeStatus:row.status});
   }else if(type==='stores'){
    const [row]=await tx`select s.id,s.status,s.updated_at::text as version,(s.featured_until>now()) as was_featured,sp.status as seller_status from stores s join seller_profiles sp on sp.id=s.seller_profile_id where s.id=${id} for update of s for share of sp`;if(!row)fail(404,'فروشگاه پیدا نشد.');checkVersion(expectedVersion,row.version);if(fields.status==='ACTIVE'&&row.seller_status!=='ACTIVE')fail(409,'ابتدا وضعیت فروشنده باید فعال شود.');
    const patch:any={updated_at:new Date().toISOString()};for(const [k,v] of Object.entries(fields))if(k!=='featured')patch[k]=v;
    await tx`update stores set ${tx(patch)} where id=${id}`;if(fields.featured!==undefined&&fields.featured!==Boolean(row.was_featured))await tx`update stores set featured_until=${fields.featured?'infinity':null}::timestamptz where id=${id}`;await audit(tx,a.userId,'store',id,'ADMIN_EDIT_STORE',reason,{fields:Object.keys(fields),beforeStatus:row.status});
   }else{
    const [row]=await tx`select p.*,p.updated_at::text as version,s.status as store_status,sp.status as seller_status from products p join stores s on s.id=p.store_id join seller_profiles sp on sp.id=s.seller_profile_id where p.id=${id} for update of p for share of s,sp`;if(!row)fail(404,'محصول پیدا نشد.');checkVersion(expectedVersion,row.version);
    const category=fields.category??row.category;const variants=await tx`select options from product_variants where product_id=${id}`;for(const v of variants)await optionsAllowed(tx,category,v.options??{});
    if((fields.productType??row.product_type)==='MADE_TO_ORDER'&&(fields.productionDays??row.production_days)<1)fail(400,'زمان ساخت محصول سفارشی لازم است.');
    if(fields.status==='PUBLISHED'){if(row.store_status!=='ACTIVE'||row.seller_status!=='ACTIVE')fail(409,'انتشار نیازمند فروشنده و فروشگاه فعال است.');if(!(await tx`select v.id from product_variants v join inventory i on i.variant_id=v.id where v.product_id=${id} and v.status='ACTIVE' limit 1`).length)fail(409,'یک تنوع فعال با موجودی ثبت‌شده لازم است.');}
    if(fields.imageUrl&&fields.imageUrl!==row.image_url){const match=/^\/api\/marketplace\/v21\/media\/([0-9a-f-]{36})$/.exec(fields.imageUrl);if(!match||!(await tx`select id from marketplace_media where id=${match[1]!} and owner_id=${a.userId}`).length)fail(400,'تصویر باید از فایل بارگذاری‌شدهٔ خود مدیر انتخاب شود.');}
    const map:Record<string,string>={productType:'product_type',productionDays:'production_days',imageUrl:'image_url'};const patch:any={updated_at:new Date().toISOString()};for(const [k,v] of Object.entries(fields))patch[map[k]??k]=v;await tx`update products set ${tx(patch)} where id=${id}`;await audit(tx,a.userId,'product',id,'ADMIN_EDIT_PRODUCT',reason,{fields:Object.keys(fields),beforeStatus:row.status});
   }
  }));
  if(shouldRevoke)await revoke(id,fields.status==='HIDDEN'?'table-hidden':'table-closed',req);return {data:{saved:true,...(inviteCode?{inviteCode}:{})}};
 });
 app.patch<{Params:{id:string;variantId:string}}>(`${base}/products/:id/variants/:variantId`,async req=>{
  const id=parse(uuid,req.params.id),variant=parse(uuid,req.params.variantId),b=parse(variantFields.extend(credentials.shape).strict(),req.body),a=await writable(req,b);const {password:_password,reason,expectedVersion,...fields}=b;if(!Object.keys(fields).length)fail(400,'تغییری انتخاب نشده است.');
  await write(()=>q.begin(async tx=>{
   const [p]=await tx`select id,category from products where id=${id} for update`;if(!p)fail(404,'محصول پیدا نشد.');
   const [v]=await tx`select v.*,v.updated_at::text as version,i.quantity_on_hand,i.quantity_reserved from product_variants v join inventory i on i.variant_id=v.id where v.id=${variant} and v.product_id=${id} for update of v,i`;if(!v)fail(404,'تنوع محصول پیدا نشد.');checkVersion(expectedVersion,v.version);
   if(fields.options)await optionsAllowed(tx,p.category,fields.options);
   const discount=fields.discountRial===undefined?v.discount_rial:fields.discountRial,starts=fields.discountStartsAt===undefined?v.discount_starts_at:fields.discountStartsAt,ends=fields.discountEndsAt===undefined?v.discount_ends_at:fields.discountEndsAt;
   if(discount!==null&&(!starts||!ends||new Date(String(ends))<=new Date(String(starts))||Number(discount)>=(fields.priceRial??Number(v.price_rial))))fail(400,'مبلغ یا بازهٔ تخفیف معتبر نیست.');
   await tx`select set_config('dnd.marketplace_actor',${a.userId},true),set_config('dnd.marketplace_reason',${reason},true)`;
   if(fields.stock!==undefined){if(fields.stock<v.quantity_reserved)fail(409,'موجودی نمی‌تواند از رزروهای فعال کمتر باشد.');await tx`update inventory set quantity_on_hand=${fields.stock},updated_at=now() where variant_id=${variant}`;await tx`insert into marketplace_stock_movements(variant_id,actor_id,before_quantity,after_quantity,reason) values(${variant},${a.userId},${v.quantity_on_hand},${fields.stock},${reason})`;}
   const patch:any={updated_at:new Date().toISOString()};const map:Record<string,string>={priceRial:'price_rial',perOrderLimit:'per_order_limit',discountRial:'discount_rial',discountStartsAt:'discount_starts_at',discountEndsAt:'discount_ends_at'};for(const [k,value] of Object.entries(fields))if(k!=='stock')patch[map[k]??k]=k==='options'?JSON.stringify(value):value;await tx`update product_variants set ${tx(patch)} where id=${variant}`;await audit(tx,a.userId,'product_variant',variant,'ADMIN_EDIT_VARIANT',reason,{productId:id,fields:Object.keys(fields)});
  }));return {data:{saved:true}};
 });
 app.delete<{Params:{kind:string;id:string}}>(`${base}/:kind/:id`,async(req,reply)=>{
  const type=parse(kind,req.params.kind),id=parse(uuid,req.params.id),b=parse(credentials.extend({confirmTitle:text(220)}).strict(),req.body),a=await writable(req,b);
  await q.begin(async tx=>{
   if(type==='tables'){
    const [row]=await tx`select title,updated_at::text as version from game_tables where id=${id} for update`;if(!row)fail(404,'میز پیدا نشد.');checkVersion(b.expectedVersion,row.version);if(row.title!==b.confirmTitle)fail(409,'نام تأیید با نام میز یکسان نیست.');
    await tx`insert into game_table_deletions(table_id,requested_by) values(${id},${a.userId}) on conflict(table_id) do nothing`;await tx`update game_tables set status='HIDDEN',updated_at=now() where id=${id}`;await audit(tx,a.userId,'game_table',id,'ADMIN_DELETE_TABLE',b.reason,{title:row.title});
   }else{
    const target=type==='stores'?'stores':'products';const [row]=await tx`select name,status,updated_at::text as version from ${tx(target)} where id=${id} for update`;if(!row)fail(404,'مورد پیدا نشد.');checkVersion(b.expectedVersion,row.version);if(row.name!==b.confirmTitle)fail(409,'نام تأیید با نام مورد یکسان نیست.');await tx`update ${tx(target)} set status='ARCHIVED',updated_at=now() where id=${id}`;await audit(tx,a.userId,type==='stores'?'store':'product',id,'ADMIN_ARCHIVE',b.reason,{name:row.name,beforeStatus:row.status});
   }
  });
  if(type!=='tables')return {data:{archived:true,restorable:true}};
  await revoke(id,'table-deleted',req);const done=await processTableDeletion(id);return reply.code(done?200:202).send({data:done?{deleted:true}:{deletionPending:true}});
 });
}
