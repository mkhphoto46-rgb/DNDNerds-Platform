import type {FastifyInstance} from 'fastify';
import {z} from 'zod';
import {sqlClient as q} from '../db/client.js';
import {listProducts} from './catalog.js';
export async function registerStorefront(app:FastifyInstance){
 app.get('/api/v1/marketplace/v21/products/:productId/presentation',async(req,reply)=>{
  const b=z.object({productId:z.string().uuid()}).safeParse(req.params);if(!b.success)return reply.code(400).send({error:{message:'شناسهٔ محصول معتبر نیست.'}});
  const [row]=await q`select p.id,p.category,s.id as "storeId",s.slug,s.name,s.description,s.category as "storeCategory",(s.verified and s.identity_evidence_ref is not null) as verified,
   (select count(*)::int from products x where x.store_id=s.id and x.status='PUBLISHED' and exists(select 1 from product_variants v join inventory i on i.variant_id=v.id where v.product_id=x.id and v.status='ACTIVE')) as "productCount",
   (select count(*)::int from marketplace_reviews r where r.store_id=s.id and r.status='PUBLISHED') as "reviewCount",
   (select coalesce(round(avg(r.rating)::numeric,1),0)::float from marketplace_reviews r where r.store_id=s.id and r.status='PUBLISHED') as rating
   from products p join stores s on s.id=p.store_id where p.id=${b.data.productId} and p.status='PUBLISHED' and s.status='ACTIVE'`;
  if(!row)return reply.code(404).send({error:{message:'محصول یافت نشد.'}});
  const [shipping]=await q`select method,fee_rial as "feeRial",dispatch_days as "dispatchDays" from marketplace_shipping_profiles where store_id=${row.storeId}`;
  const own=await listProducts({store:row.slug,limit:8});
  let related=own.data.filter(p=>p.id!==row.id);
  if(related.length<4){const category=await listProducts({category:row.category,limit:8});const used=new Set([row.id,...related.map(p=>p.id)]);related.push(...category.data.filter(p=>!used.has(p.id)));}
  return {store:{id:row.storeId,slug:row.slug,name:row.name,description:row.description,category:row.storeCategory,verified:row.verified,productCount:row.productCount,rating:row.rating,reviewCount:row.reviewCount},shipping:shipping?{...shipping,feeRial:Number(shipping.feeRial),dispatchDays:Number(shipping.dispatchDays)}:null,related:related.slice(0,8)};
 });
}
