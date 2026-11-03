import type {FastifyInstance,FastifyRequest} from 'fastify';
import {z} from 'zod';
import {sqlClient as q} from '../db/client.js';
import {requireAuthUser} from '../auth/session.js';
import {reauth} from '../routes/admin.js';
function fail(statusCode:number,message:string):never{throw Object.assign(new Error(message),{statusCode});}
export async function publish(productId:string,actorId:string,status:'PUBLISHED'|'DRAFT',storeId?:string,reason='Seller publication'){
 return q.begin(async tx=>{
  const [p]=await tx`select p.id,p.store_id,s.status as store_status,sp.status as seller_status from products p join stores s on s.id=p.store_id join seller_profiles sp on sp.id=s.seller_profile_id where p.id=${productId} for update of p for share of s,sp`;
  if(!p||storeId&&p.store_id!==storeId)fail(404,'محصول یافت نشد.');
  if(status==='PUBLISHED'){
   if(p.store_status!=='ACTIVE'||p.seller_status!=='ACTIVE')fail(403,'انتشار فقط برای فروشنده و فروشگاه فعال مجاز است.');
   const [v]=await tx`select v.id from product_variants v join inventory i on i.variant_id=v.id where v.product_id=${productId} and v.status='ACTIVE' limit 1`;
   if(!v)fail(409,'برای انتشار، دست‌کم یک تنوع فعال با موجودی ثبت‌شده لازم است.');
  }
  await tx`update products set status=${status},updated_at=now() where id=${productId}`;
  await tx`insert into marketplace_audit(actor_id,action,entity_id,details) values(${actorId},${status==='PUBLISHED'?'PRODUCT_PUBLISH':'PRODUCT_UNPUBLISH'},${productId},${JSON.stringify({reason,storeId:p.store_id})}::jsonb)`;
  return {ok:true,status};
 });
}
export async function registerProductPublishing(app:FastifyInstance){
 const body=z.object({status:z.enum(['PUBLISHED','DRAFT'])});
 app.post('/api/v1/marketplace/v21/seller/stores/:storeId/products/:productId/publication',async req=>{
  const u=await requireAuthUser(req);if(!u)fail(401,'ابتدا وارد حساب شوید.');
  const p=z.object({storeId:z.string().uuid(),productId:z.string().uuid()}).safeParse(req.params),b=body.safeParse(req.body);if(!p.success||!b.success)fail(400,'درخواست معتبر نیست.');
  const [member]=await q`select role from store_members where store_id=${p.data.storeId} and user_id=${u.id} and role in ('OWNER','MANAGER','PRODUCT_EDITOR')`;
  if(!member)fail(403,'دسترسی مدیریت این محصول را ندارید.');
  const [store]=await q`select status from stores where id=${p.data.storeId}`;if(store?.status!=='ACTIVE')fail(403,'فروشگاه باید فعال باشد.');
  return publish(p.data.productId,u.id,b.data.status,p.data.storeId);
 });
 app.post('/api/v1/admin/marketplace/products/:productId/publication',async req=>{
  const p=z.object({productId:z.string().uuid()}).safeParse(req.params),b=body.extend({password:z.string().min(1).max(128),reason:z.string().trim().min(3).max(500)}).safeParse(req.body);if(!p.success||!b.success)fail(400,'درخواست معتبر نیست.');
  const a=await reauth(req,b.data.password);if(!a||!['SUPER_ADMIN','MARKETPLACE_ADMIN'].includes(a.role))fail(403,'رمز یا دسترسی مدیر معتبر نیست.');
  return publish(p.data.productId,a.userId,b.data.status,undefined,b.data.reason);
 });
}

