import type {FastifyInstance, FastifyRequest} from 'fastify';
import {z} from 'zod';
import {sqlClient as q} from '../db/client.js';
import {requireAuthUser} from '../auth/session.js';
import {getAdmin} from '../routes/admin.js';

function fail(statusCode:number,message:string):never{throw Object.assign(new Error(message),{statusCode});}
const timestamp=z.string().datetime({offset:true});
const filters=z.object({from:timestamp.optional(),to:timestamp.optional(),storeId:z.string().uuid().optional(),
 paymentStatus:z.enum(['NO_PAYMENT','SUCCEEDED','PARTIALLY_REFUNDED','REFUNDED']).optional(),
 fulfillmentStatus:z.enum(['PENDING_PAYMENT','PAID','PROCESSING','SHIPPED','DELIVERED','CANCELLED','REFUNDED']).optional(),
 q:z.string().trim().max(160).optional(),limit:z.coerce.number().int().min(1).max(50).default(25),cursor:z.string().max(500).optional()});
const cursorSchema=z.object({createdAt:timestamp,id:z.string().uuid()});

/** Read-only accounting projection. All money arithmetic stays in PostgreSQL numeric. */
export async function registerSalesReporting(app:FastifyInstance){
 async function report(req:FastifyRequest,seller:boolean){
  let userId:string|null=null;
  if(seller){const u=await requireAuthUser(req);if(!u)fail(401,'ابتدا وارد حساب شوید.');userId=u.id;}
  else {const a=await getAdmin(req);if(!a||!['SUPER_ADMIN','MARKETPLACE_ADMIN'].includes(a.role))fail(403,'دسترسی مدیر بازارچه لازم است.');}
  const parsed=filters.safeParse(req.query);if(!parsed.success)fail(400,'فیلتر گزارش معتبر نیست.');const f=parsed.data;
  if(f.from&&f.to){const [range]=await q`select ${f.from}::timestamptz < ${f.to}::timestamptz valid`;if(!range!.valid)fail(400,'بازه زمانی معتبر نیست.');}
  let cursor:z.infer<typeof cursorSchema>|null=null;
  if(f.cursor){try{cursor=cursorSchema.parse(JSON.parse(Buffer.from(f.cursor,'base64url').toString('utf8')));}catch{fail(400,'نشانگر صفحه معتبر نیست.');}}
  if(seller){const members=await q`select store_id from store_members where user_id=${userId} and role in ('OWNER','MANAGER') and (${f.storeId??null}::uuid is null or store_id=${f.storeId??null}::uuid)`;if(!members.length)fail(403,'دسترسی گزارش فروش فروشگاه لازم است.');}
  const search=f.q?'%'+f.q.replace(/[\\%_]/g,'\\$&')+'%':null;
  // Each join is one row per SellerOrder; refund cases are aggregated before joining.
  const base=q`with case_allocated as (
   select c.seller_order_id,sum(r.amount_rial)::numeric amount,sum(c.commission_reversal_rial)::numeric commission,sum(c.seller_net_reversal_rial)::numeric seller_net
   from marketplace_refund_cases c join refunds r on r.id=c.financial_refund_id and r.order_id=c.order_id and r.status='SUCCEEDED'
   join marketplace_seller_orders scoped on scoped.id=c.seller_order_id and scoped.order_id=c.order_id and scoped.store_id=c.store_id
   join marketplace_orders buyer_order on buyer_order.id=c.order_id and buyer_order.user_id=c.buyer_user_id
   join payments payment on payment.id=r.payment_id and payment.order_id=c.order_id
   where c.status='REFUNDED' and c.refund_amount_rial=r.amount_rial group by c.seller_order_id
  ), allocated as (
   select * from case_allocated
   union all
   -- Legacy whole-order finalization has no cases: only an exact completed full refund can be split by original snapshots.
   select so.id,so.gross_rial::numeric,so.platform_commission_rial::numeric,so.seller_net_rial::numeric
   from marketplace_seller_orders so join marketplace_orders o on o.id=so.order_id join payments p on p.order_id=o.id
   where o.status='REFUNDED' and so.status='REFUNDED' and p.status='REFUNDED' and p.refunded_rial=p.amount_rial and p.amount_rial=o.customer_total_rial
    and (select coalesce(sum(r.amount_rial),0) from refunds r where r.payment_id=p.id and r.status='SUCCEEDED')=p.amount_rial
    and (select count(*) from refunds r where r.payment_id=p.id and r.status='SUCCEEDED')=1
    and not exists(select 1 from marketplace_refund_cases c join refunds r on r.id=c.financial_refund_id where r.payment_id=p.id)
    and not exists(select 1 from marketplace_seller_orders other where other.order_id=o.id and other.status<>'REFUNDED')
    and (select sum(other.gross_rial) from marketplace_seller_orders other where other.order_id=o.id)=p.amount_rial
  ), facts as (
   select so.id,so.order_id,so.store_id,so.created_at,so.status::text fulfillment_status,s.name store_name,u.id buyer_id,u.username buyer_name,u.email buyer_email,
    (select coalesce(sum(i.line_total_rial),0)::numeric from marketplace_order_items i where i.seller_order_id=so.id) merchandise,
    case when so.shipping_snapshot->>'feeRial' ~ '^[0-9]+$' then (so.shipping_snapshot->>'feeRial')::numeric else null end shipping,
    so.gross_rial::numeric gross,so.platform_commission_rial::numeric commission,so.seller_net_rial::numeric seller_net,
    coalesce(p.status::text,'NO_PAYMENT') payment_status,p.paid_at,sh.shipped_at,coalesce(e.delivered_at,sh.delivered_at) delivered_at,
    coalesce(a.amount,0)::numeric refunded,coalesce(a.commission,0)::numeric commission_reversal,coalesce(a.seller_net,0)::numeric seller_net_reversal,
    (p.id is not null and p.status in ('SUCCEEDED','PARTIALLY_REFUNDED','REFUNDED')) paid,
    (p.id is not null and (p.amount_rial<>o.customer_total_rial or p.currency<>so.currency or p.refunded_rial<>(select coalesce(sum(r.amount_rial),0) from refunds r where r.payment_id=p.id and r.status='SUCCEEDED')
      or p.refunded_rial<>(select coalesce(sum(a2.amount),0) from allocated a2 join marketplace_seller_orders so2 on so2.id=a2.seller_order_id where so2.order_id=o.id)))
      or coalesce(a.amount,0)>so.gross_rial or coalesce(a.commission,0)+coalesce(a.seller_net,0)<>coalesce(a.amount,0)
      or (p.id is null and so.status in ('PAID','PROCESSING','SHIPPED','DELIVERED','REFUNDED'))
      or (p.id is not null and so.status in ('CANCELLED','PENDING_PAYMENT')) reconciliation_mismatch
   from marketplace_seller_orders so join marketplace_orders o on o.id=so.order_id join stores s on s.id=so.store_id left join users u on u.id=o.user_id
   left join payments p on p.order_id=o.id left join allocated a on a.seller_order_id=so.id
   left join marketplace_shipments sh on sh.seller_order_id=so.id left join marketplace_delivery_evidence e on e.seller_order_id=so.id
   where (${userId}::uuid is null or exists(select 1 from store_members m where m.store_id=so.store_id and m.user_id=${userId}::uuid and m.role in ('OWNER','MANAGER')))
    and (${f.storeId??null}::uuid is null or so.store_id=${f.storeId??null}::uuid)
    and (${f.from??null}::timestamptz is null or so.created_at>=${f.from??null}::timestamptz)
    and (${f.to??null}::timestamptz is null or so.created_at<${f.to??null}::timestamptz)
    and (${f.fulfillmentStatus??null}::text is null or so.status::text=${f.fulfillmentStatus??null})
    and (${search}::text is null or u.username ilike ${search} or u.email ilike ${search} or s.name ilike ${search} or so.id::text ilike ${search} or o.id::text ilike ${search}
      or exists(select 1 from marketplace_order_items i where i.seller_order_id=so.id and (i.product_name_snapshot ilike ${search} or i.sku_snapshot ilike ${search})))
  ), filtered as (select * from facts where (${f.paymentStatus??null}::text is null or payment_status=${f.paymentStatus??null}))`;
  // Single SQL statement gives page and full filtered summary the same MVCC snapshot.
  const [result]=await q`${base}, page as (select * from filtered where (${cursor?.id??null}::uuid is null or (created_at,id)<(${cursor?.createdAt??null}::timestamptz,${cursor?.id??null}::uuid)) order by created_at desc,id desc limit ${f.limit+1})
   select (select jsonb_build_object('orderCount',count(*)::int,'paidRial',coalesce(sum(gross) filter(where paid),0)::text,
    'pendingRial',coalesce(sum(gross) filter(where not paid and fulfillment_status='PENDING_PAYMENT'),0)::text,
    'refundedRial',coalesce(sum(refunded),0)::text,'netPaidRial',coalesce(sum(case when paid then gross-refunded else 0 end),0)::text,
    'commissionRial',coalesce(sum(case when paid then commission-commission_reversal else 0 end),0)::text,
    'sellerNetRial',coalesce(sum(case when paid then seller_net-seller_net_reversal else 0 end),0)::text,
    'merchandiseRial',coalesce(sum(merchandise),0)::text,'shippingRial',(case when count(shipping)=count(*) then coalesce(sum(shipping),0) else null end)::text,'commissionReversalRial',coalesce(sum(commission_reversal),0)::text,'sellerNetReversalRial',coalesce(sum(seller_net_reversal),0)::text,
    'mismatchCount',count(*) filter(where reconciliation_mismatch)::int) from filtered) summary,
   coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'orderId',p.order_id,'storeId',p.store_id,'storeName',p.store_name,
    'buyerId',p.buyer_id,'buyerName',p.buyer_name,'buyerEmail',p.buyer_email,'createdAt',p.created_at,'paidAt',p.paid_at,'shippedAt',p.shipped_at,'deliveredAt',p.delivered_at,
    'fulfillmentStatus',p.fulfillment_status,'paymentStatus',p.payment_status,'grossRial',p.gross::text,'commissionRial',p.commission::text,'sellerNetRial',p.seller_net::text,
    'merchandiseRial',p.merchandise::text,'shippingRial',p.shipping::text,'commissionReversalRial',p.commission_reversal::text,'sellerNetReversalRial',p.seller_net_reversal::text,'refundedRial',p.refunded::text,'netPaidRial',(case when p.paid then p.gross-p.refunded else 0 end)::text,'reconciliationMismatch',p.reconciliation_mismatch,
    'items',coalesce((select jsonb_agg(jsonb_build_object('id',i.id,'productId',i.product_id,'name',i.product_name_snapshot,'variantName',i.variant_name_snapshot,'quantity',i.quantity,'unitPriceRial',i.unit_price_rial::text,'lineTotalRial',i.line_total_rial::text) order by i.id) from marketplace_order_items i where i.seller_order_id=p.id),'[]'::jsonb)) order by p.created_at desc,p.id desc) from page p),'[]'::jsonb) data`;
  const data=result!.data as {id:string;createdAt:string}[];const more=data.length>f.limit;if(more)data.pop();const last=data.at(-1);
  const stores=await q`select s.id,s.name from stores s where (${userId}::uuid is null or exists(select 1 from store_members m where m.store_id=s.id and m.user_id=${userId}::uuid and m.role in ('OWNER','MANAGER'))) order by s.name,s.id`;
  return {data,stores,summary:result!.summary,nextCursor:more&&last?Buffer.from(JSON.stringify({id:last.id,createdAt:last.createdAt})).toString('base64url'):null};
 }
 app.get('/api/v1/admin/marketplace/sales',(req,reply)=>{reply.header('Cache-Control','private, no-store');return report(req,false);});
 app.get('/api/v1/marketplace/v21/seller/sales',(req,reply)=>{reply.header('Cache-Control','private, no-store');return report(req,true);});
}
