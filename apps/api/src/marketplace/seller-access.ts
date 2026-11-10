import {storeNameSchema,storeSlugSchema,rethrowStoreIdentityError} from './store-identity.js';
import type {FastifyInstance} from 'fastify';
import {z} from 'zod';
import {sqlClient as q} from '../db/client.js';
import {getAdmin,reauth} from '../routes/admin.js';
function fail(statusCode:number,message:string):never{throw Object.assign(new Error(message),{statusCode});}
export async function registerSellerAccess(app:FastifyInstance){
 const base='/api/v1/admin/marketplace/seller-access';
 app.get(base,async req=>{
  const a=await getAdmin(req);if(!a||!['SUPER_ADMIN','MARKETPLACE_ADMIN'].includes(a.role))fail(403,'دسترسی مدیر بازارچه لازم است.');
  const b=z.object({q:z.string().trim().min(3).max(254).optional(),userId:z.string().uuid().optional()}).safeParse(req.query);
  if(!b.success||(!b.data.q&&!b.data.userId))fail(400,'ایمیل، نام کاربری یا حساب را مشخص کنید.');
  return {data:await q`select u.id as "userId",u.email,u.username,u.status,sp.id as "sellerId",sp.status as "sellerStatus",s.name as "storeName" from users u left join seller_profiles sp on sp.user_id=u.id left join lateral (select name from stores where seller_profile_id=sp.id order by created_at limit 1) s on true where (${b.data.userId??null}::uuid is not null and u.id=${b.data.userId??null}::uuid) or (${b.data.userId??null}::uuid is null and (lower(u.email)=lower(${b.data.q??''}) or lower(u.username)=lower(${b.data.q??''}))) order by u.created_at desc limit 20`};
 });
 app.post(base,async(req,reply)=>{
  const b=z.object({userId:z.string().uuid(),name:storeNameSchema,slug:storeSlugSchema,category:z.string().min(1).max(120),password:z.string().min(1).max(128),reason:z.string().trim().min(3).max(500)}).safeParse(req.body);
  if(!b.success)fail(400,'اطلاعات فروشگاه، رمز مدیر و دلیل تغییر لازم است.');
  const a=await reauth(req,b.data.password);if(!a||!['SUPER_ADMIN','MARKETPLACE_ADMIN'].includes(a.role))fail(403,'رمز یا دسترسی مدیر معتبر نیست.');
  const c=b.data;
  try{
   const result=await q.begin(async tx=>{
    const [u]=await tx`select id,status from users where id=${c.userId} for update`;
    if(!u)fail(404,'حساب یافت نشد.');if(u.status!=='ACTIVE')fail(409,'ابتدا حساب کاربر را فعال کنید.');
    const [existing]=await tx`select id from seller_profiles where user_id=${u.id}`;
    if(existing)fail(409,'این حساب پروندهٔ فروشندگی دارد؛ از فهرست درخواست‌ها وضعیت آن را تغییر دهید.');
    const [category]=await tx`select slug from marketplace_category_definitions where slug=${c.category}`;if(!category)fail(400,'دسته‌بندی معتبر نیست.');
    const [seller]=await tx`insert into seller_profiles(user_id,display_name,status) values(${u.id},${c.name},'ACTIVE') returning id`;
    const [store]=await tx`insert into stores(seller_profile_id,name,slug,description,category,status,verified) values(${seller!.id},${c.name},${c.slug},'',${c.category},'ACTIVE',false) returning id,slug`;
    await tx`insert into store_members(store_id,user_id,role) values(${store!.id},${u.id},'OWNER')`;
    await tx`insert into marketplace_audit(actor_id,action,entity_id,details) values(${a.userId},'ADMIN_SELLER_ASSIGN',${seller!.id},${JSON.stringify({userId:u.id,storeId:store!.id,reason:c.reason})}::jsonb)`;
    return {sellerId:seller!.id,storeId:store!.id,slug:store!.slug};
   });return reply.code(201).send({...result,ok:true});
  }catch(error){rethrowStoreIdentityError(error);}
 });
}
