import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { sqlClient as q } from '../db/client.js';

export const catalogQuery = z.object({
  q:z.string().trim().max(100).default(''), category:z.string().max(120).default(''),
  store:z.string().max(120).default(''), minPrice:z.coerce.number().int().min(0).max(2_000_000_000).default(0),
  maxPrice:z.coerce.number().int().min(0).max(2_000_000_000).default(2_000_000_000),
  available:z.enum(['true','false']).default('false'),discount:z.enum(['true','false']).default('false'),
  color:z.string().max(80).default(''),size:z.string().max(80).default(''),scale:z.string().max(80).default(''),material:z.string().max(80).default(''),
  limit:z.coerce.number().int().min(1).max(60).default(24),page:z.coerce.number().int().min(1).max(400).default(1),
}).refine(x=>x.minPrice<=x.maxPrice);

export async function listProducts(input: unknown):Promise<{data:ReturnType<typeof mapProduct>[];pagination:{limit:number;page:number;returned:number;total:number};source:"postgresql"}> {
  const f=catalogQuery.parse(input);
  const options=Object.fromEntries(['color','size','scale','material'].filter(k=>f[k as 'color']).map(k=>[k,f[k as 'color']]));
  // Filter all attributes, price and availability on the SAME variant.
  const variantFilter=q`v.effective_price between ${f.minPrice} and ${f.maxPrice} and v.options @> ${JSON.stringify(options)}::jsonb
    and (${f.available!=='true'} or i.quantity_on_hand>i.quantity_reserved) and (${f.discount!=='true'} or v.effective_price<v.price_rial)`;
  const rows=await q`
    with active_variants as not materialized (select *,case when discount_rial is not null and now()>=discount_starts_at and now()<discount_ends_at then discount_rial else price_rial end effective_price from product_variants where status='ACTIVE'),
    matched as (select p.id,p.name from products p join stores s on s.id=p.store_id and s.status='ACTIVE'
      where p.status='PUBLISHED' and (${f.category}='' or p.category=${f.category}) and (${f.store}='' or s.slug=${f.store})
      and (${f.q}='' or to_tsvector('simple',p.name||' '||p.description||' '||p.category) @@ plainto_tsquery('simple',${f.q}))
      and exists(select 1 from active_variants v join inventory i on i.variant_id=v.id where v.product_id=p.id and ${variantFilter})),
    page as (select id,count(*) over() total from matched order by name,id limit ${f.limit} offset ${(f.page-1)*f.limit})
    select p.id,p.slug,p.name,p.description,p.category,p.product_type as "productType",p.brand,p.image_url as "imageUrl",p.production_days as "productionDays",
      s.id as "storeId",s.slug as "storeSlug",s.name as "storeName",(s.verified and s.identity_evidence_ref is not null) as verified,
      jsonb_agg(jsonb_build_object('id',v.id,'sku',v.sku,'name',v.name,'options',v.options,'priceRial',v.effective_price,'basePriceRial',v.price_rial,
      'priceToman',v.effective_price/10.0,'inventory',greatest(0,i.quantity_on_hand-i.quantity_reserved),'perOrderLimit',v.per_order_limit,
      'priceEffectiveAt',v.price_effective_at,'discountEndsAt',case when v.effective_price<v.price_rial then v.discount_ends_at end)
      order by v.effective_price,v.id) as variants,max(page.total) as total
    from page join products p on p.id=page.id join stores s on s.id=p.store_id and s.status='ACTIVE'
    join active_variants v on v.product_id=p.id join inventory i on i.variant_id=v.id where ${variantFilter}
    group by p.id,s.id order by p.name,p.id`;
  const total=rows[0]?Number(rows[0].total):f.page>1?(await listProducts({...f,page:1,limit:1})).pagination.total:0;
  return {data:rows.map(mapProduct),pagination:{limit:f.limit,page:f.page,returned:rows.length,total},source:'postgresql' as const};
}

function mapProduct(r: Record<string, any>) {
  const first=r.variants[0];
  return {id:r.id,slug:r.slug,name:r.name,description:r.description,category:r.category,productType:r.productType,brand:r.brand,imageUrl:r.imageUrl,
    productionDays:r.productionDays,storeId:r.storeId,store:{id:r.storeId,slug:r.storeSlug,name:r.storeName,verified:r.verified},
    priceRial:Number(first.priceRial),priceToman:Number(first.priceToman),inventory:r.variants.reduce((n:number,v:any)=>n+v.inventory,0),variants:r.variants,source:'postgresql'};
}

export async function registerCatalog(app:FastifyInstance){
  app.get('/api/v1/products',async(req,reply)=>{
    const f=catalogQuery.safeParse(req.query);if(!f.success)return reply.code(400).send({error:{code:'INVALID_FILTER',message:'فیلتر یا صفحه معتبر نیست.'}});
    return listProducts(f.data);
  });
  app.get('/api/v1/stores',async()=>({data:await q`
    select s.id,s.slug,s.name,s.description,s.category,(s.verified and s.identity_evidence_ref is not null) verified,
      (s.address_verified_at is not null) as "addressVerified",(s.featured_until>now()) as featured,s.fulfillment_mode as "fulfillmentMode",
      coalesce((select round(avg(r.rating)::numeric,2) from marketplace_reviews r where r.store_id=s.id and r.status='PUBLISHED'),0)::float as rating,
      (select count(*)::int from marketplace_reviews r where r.store_id=s.id and r.status='PUBLISHED') as "reviewCount",
      (select count(*)::int from products p where p.store_id=s.id and p.status='PUBLISHED') as "productCount",
      coalesce(c.commission_bps,g.default_commission_bps,500) as "commissionBps",coalesce(c.commission_bps,g.default_commission_bps,500)/100.0 as "commissionPercent"
    from stores s left join store_commission_settings c on c.store_id=s.id and c.active=true
    left join marketplace_config g on g.id='global' where s.status='ACTIVE' order by featured desc nulls last,s.name,s.id limit 200`,source:'postgresql'}));
  app.get('/api/v1/stores/:storeSlug',async(req,reply)=>{
    const {storeSlug}=req.params as {storeSlug:string};
    const [s]=await q`select id,slug,name,description,category,(verified and identity_evidence_ref is not null) verified,fulfillment_mode as "fulfillmentMode",
      coalesce((select round(avg(r.rating)::numeric,2) from marketplace_reviews r where r.store_id=stores.id and r.status='PUBLISHED'),0)::float as rating,
      (select count(*)::int from marketplace_reviews r where r.store_id=stores.id and r.status='PUBLISHED') as "reviewCount" from stores where slug=${storeSlug} and status='ACTIVE' `;
    if(!s)return reply.code(404).send({error:{code:'STORE_NOT_FOUND'}});
    const catalog=await listProducts({store:storeSlug,limit:60});
    return {...s,products:catalog.data,source:'postgresql'};
  });
  app.get('/api/v1/stores/:storeSlug/products/:productSlug',async(req,reply)=>{
    const {storeSlug,productSlug}=req.params as {storeSlug:string;productSlug:string};
    const [p]=await q`select p.id from products p join stores s on s.id=p.store_id where s.slug=${storeSlug} and p.slug=${productSlug} and s.status='ACTIVE' and p.status='PUBLISHED'`;
    if(!p)return reply.code(404).send({error:{code:'PRODUCT_NOT_FOUND'}});
    // Direct details use the same visibility and pricing rules, without a catalog-page scan.
    const rows=await q`select p.id,p.slug,p.name,p.description,p.category,p.product_type as "productType",p.brand,p.image_url as "imageUrl",p.production_days as "productionDays",s.id as "storeId",s.slug as "storeSlug",s.name as "storeName",(s.verified and s.identity_evidence_ref is not null) as verified,
      jsonb_agg(jsonb_build_object('id',v.id,'sku',v.sku,'name',v.name,'options',v.options,'priceRial',case when now()>=v.discount_starts_at and now()<v.discount_ends_at then v.discount_rial else v.price_rial end,'basePriceRial',v.price_rial,'priceToman',(case when now()>=v.discount_starts_at and now()<v.discount_ends_at then v.discount_rial else v.price_rial end)/10.0,'inventory',greatest(0,i.quantity_on_hand-i.quantity_reserved),'perOrderLimit',v.per_order_limit,'priceEffectiveAt',v.price_effective_at) order by v.is_default desc,v.id) variants
      from products p join stores s on s.id=p.store_id join product_variants v on v.product_id=p.id and v.status='ACTIVE' join inventory i on i.variant_id=v.id
      where p.id=${p.id} and s.status='ACTIVE' and p.status='PUBLISHED' group by p.id,s.id`;
    if(!rows[0])return reply.code(404).send({error:{code:'PRODUCT_NOT_FOUND'}});
    return mapProduct(rows[0]);
  });
}
