import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { sqlClient as q } from '../db/client.js';
import { getAdmin, reauth } from '../routes/admin.js';
import { settlementEligibility } from './settlement-policy.js';

const id = z.string().uuid();
const note = z.string().trim().min(10).max(1000);
const command = z.object({ password: z.string().min(8).max(128), reason: note });
function fail(statusCode: number, message: string): never { throw Object.assign(new Error(message), { statusCode }); }
function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value); if (!result.success) fail(400, 'اطلاعات بررسی معتبر نیست.'); return result.data;
}
async function staff(req: FastifyRequest, password?: string) {
  const a = password === undefined ? await getAdmin(req) : await reauth(req, password);
  if (!a || !['SUPER_ADMIN', 'MARKETPLACE_ADMIN'].includes(a.role)) fail(403, 'تأیید هویت مدیر بازارچه لازم است.');
  return a;
}
function sandbox() {
  if (process.env.NODE_ENV === 'production') fail(503, 'این مسیر فقط برای اعتبارسنجی آزمایشی است؛ سرویس مالی واقعی فعال نیست.');
}
const policyProjection = q`select p.*, (a.policy_id is not null and r.policy_id is null) as approved
  from marketplace_payout_policies p left join marketplace_payout_policy_approvals a on a.policy_id=p.id
  left join marketplace_payout_policy_revocations r on r.policy_id=p.id`;

/** Delivery attestation never changes seller balances or executes a bank transfer. */
export async function registerDeliveryReview(app: FastifyInstance) {
  const base = '/api/v1/marketplace/v21/admin';
  app.get(`${base}/payout-policies`, async req => {
    await staff(req); return { data: await q`${policyProjection} order by p.version desc limit 100`, writingEnabled: process.env.NODE_ENV !== 'production' };
  });
  app.get(`${base}/delivery-queue`, async req => {
    await staff(req);
    return { data: await q`select so.id,so.status,s.name store_name,sh.carrier,sh.tracking_code,sh.shipped_at,
      e.confirmed_at,e.policy_version from marketplace_seller_orders so join stores s on s.id=so.store_id
      left join marketplace_shipments sh on sh.seller_order_id=so.id left join marketplace_delivery_evidence e on e.seller_order_id=so.id
      where so.status in ('SHIPPED','DELIVERED') order by so.updated_at desc limit 100` };
  });
  app.post(`${base}/payout-policies`, async (req, reply) => {
    sandbox();
    const b = parse(command.extend({ name: z.string().trim().min(3).max(180),
      returnWindowHours: z.number().int().min(0).max(8784), settlementDelayHours: z.number().int().min(0).max(8784),
      evidenceRef: z.string().trim().min(10).max(500) }), req.body);
    const a = await staff(req, b.password);
    const [p] = await q`insert into marketplace_payout_policies(name,return_window_hours,settlement_delay_hours,evidence_ref,reason,created_by)
      values(${b.name},${b.returnWindowHours},${b.settlementDelayHours},${b.evidenceRef},${b.reason},${a.userId}) returning id,version,scope`;
    return reply.code(201).send(p);
  });
  for (const action of ['approve', 'revoke'] as const) app.post(`${base}/payout-policies/:policyId/${action}`, async req => {
    sandbox(); const { policyId } = parse(z.object({ policyId: id }), req.params);
    const b = parse(command, req.body); const a = await staff(req, b.password);
    return q.begin(async tx => {
      const [p] = await tx`select * from marketplace_payout_policies where id=${policyId} for update`;
      if (!p) fail(404, 'نسخهٔ سیاست یافت نشد.');
      if (action === 'approve') {
        if (p.created_by === a.userId) fail(409, 'تأیید نسخه باید توسط مدیر مستقل انجام شود.');
        const [revoked] = await tx`select policy_id from marketplace_payout_policy_revocations where policy_id=${policyId}`;
        if (revoked) fail(409, 'سیاست لغوشده دوباره فعال نمی‌شود؛ نسخهٔ تازه بسازید.');
        await tx`insert into marketplace_payout_policy_approvals(policy_id,approved_by,reason) values(${policyId},${a.userId},${b.reason}) on conflict do nothing`;
      } else await tx`insert into marketplace_payout_policy_revocations(policy_id,revoked_by,reason) values(${policyId},${a.userId},${b.reason}) on conflict do nothing`;
      return { ok: true, scope: 'SANDBOX' };
    });
  });
  app.post(`${base}/seller-orders/:sellerOrderId/delivery-review`, async req => {
    sandbox(); const { sellerOrderId } = parse(z.object({ sellerOrderId: id }), req.params);
    const b = parse(command.extend({ policyId: id, mediaId: id, deliveredAt: z.iso.datetime() }), req.body);
    const a = await staff(req, b.password);
    return q.begin(async tx => {
      const [scope] = await tx`select order_id,store_id from marketplace_seller_orders where id=${sellerOrderId}`;
      if (!scope) fail(404, 'زیرسفارش یافت نشد.');
      await tx`select pg_advisory_xact_lock(hashtextextended(${'refund:' + scope.order_id},0))`;
      await tx`select pg_advisory_xact_lock(hashtextextended(${'seller-balance:' + scope.store_id},0))`;
      const [so] = await tx`select so.*,o.user_id buyer_id from marketplace_seller_orders so join marketplace_orders o on o.id=so.order_id where so.id=${sellerOrderId}`;
      if (!so) fail(404, 'زیرسفارش یافت نشد.');
      const [related] = await tx`select user_id from store_members where store_id=${scope.store_id} and user_id=${a.userId}`;
      if (related || so.buyer_id === a.userId) fail(403, 'خریدار و اعضای فروشگاه نمی‌توانند تحویل همین سفارش را بررسی کنند.');
      const [prior] = await tx`select * from marketplace_delivery_evidence where seller_order_id=${sellerOrderId}`;
      if (prior) {
        if (prior.reviewer_id !== a.userId || prior.policy_version !== b.policyId || prior.evidence_ref !== b.mediaId || new Date(prior.delivered_at).getTime() !== new Date(b.deliveredAt).getTime()) fail(409, 'تأیید قبلی تغییرناپذیر است؛ اصلاح از مسیر پروندهٔ اختلاف انجام می‌شود.');
        return { ok: true, idempotent: true, fundsReleased: false };
      }
      // Lock first, then use a fresh READ COMMITTED statement snapshot. A revocation
      // committed while this lock waited must not disappear into the earlier snapshot.
      await tx`select id from marketplace_payout_policies where id=${b.policyId} for share`;
      const [policy] = await tx`select p.id from marketplace_payout_policies p join marketplace_payout_policy_approvals a on a.policy_id=p.id
        where p.id=${b.policyId} and not exists(select 1 from marketplace_payout_policy_revocations r where r.policy_id=p.id)`;
      if (!policy) fail(409, 'نسخهٔ سیاست آزمایشی باید مستقل تأیید شده و لغو نشده باشد.');
      const [media] = await tx`select id from marketplace_media where id=${b.mediaId} and owner_id=${a.userId}`;
      if (!media) fail(400, 'مدرک خصوصی متعلق به بررسی‌کننده لازم است.');
      const [shipment] = await tx`select * from marketplace_shipments where seller_order_id=${sellerOrderId}`;
      const delivered = new Date(b.deliveredAt); const now = new Date();
      if (so.status !== 'SHIPPED' || !shipment?.shipped_at || delivered < new Date(shipment.shipped_at) || delivered > now) fail(409, 'زمان تحویل باید پس از ارسال ثبت‌شده و تا زمان حاضر باشد.');
      const [payment] = await tx`select id from payments where order_id=${scope.order_id} and status in ('SUCCEEDED','PARTIALLY_REFUNDED') and provider in ('mock','mock-secondary')`;
      if (!payment) fail(409, 'پرداخت آزمایشی تأییدشده لازم است.');
      await tx`insert into marketplace_delivery_evidence(seller_order_id,reviewer_id,evidence_ref,reason,policy_version,delivered_at,confirmed_at)
        values(${sellerOrderId},${a.userId},${b.mediaId},${b.reason},${b.policyId},${delivered.toISOString()},${now.toISOString()})`;
      await tx`update marketplace_seller_orders set status='DELIVERED',updated_at=${now.toISOString()} where id=${sellerOrderId}`;
      await tx`update marketplace_shipments set status='DELIVERED',delivered_at=${delivered.toISOString()},updated_at=${now.toISOString()} where seller_order_id=${sellerOrderId}`;
      await tx`insert into marketplace_audit(actor_id,action,entity_id,details) values(${a.userId},'INDEPENDENT_DELIVERY_REVIEW',${sellerOrderId},${JSON.stringify({ policyId: b.policyId, mediaId: b.mediaId, reason: b.reason })}::jsonb)`;
      return { ok: true, idempotent: false, fundsReleased: false };
    });
  });
  app.get(`${base}/seller-orders/:sellerOrderId/settlement-eligibility`, async req => {
    await staff(req); const { sellerOrderId } = parse(z.object({ sellerOrderId: id }), req.params);
    // A consistent read gives an explanation, never a transferable authorization token.
    return q.begin('isolation level repeatable read read only', async tx => {
      const [so] = await tx`select * from marketplace_seller_orders where id=${sellerOrderId}`;
      if (!so) fail(404, 'زیرسفارش یافت نشد.');
      const [e] = await tx`select * from marketplace_delivery_evidence where seller_order_id=${sellerOrderId}`;
      const [p] = e ? await tx`select p.*, (a.policy_id is not null and r.policy_id is null) approved from marketplace_payout_policies p
        left join marketplace_payout_policy_approvals a on a.policy_id=p.id left join marketplace_payout_policy_revocations r on r.policy_id=p.id where p.id::text=${e.policy_version}` : [];
      const [payment] = await tx`select p.*,o.customer_total_rial from payments p join marketplace_orders o on o.id=p.order_id where p.order_id=${so.order_id}`;
      const [refundTotal] = payment ? await tx`select coalesce(sum(amount_rial),0)::text amount from refunds where payment_id=${payment.id} and status='SUCCEEDED'` : [];
      const [open] = await tx`select count(*)::int n from marketplace_refund_cases where seller_order_id=${sellerOrderId} and status not in ('REJECTED','REFUNDED','CLOSED')`;
      const [pending] = await tx`select count(*)::int n from refunds where order_id=${so.order_id} and status='PENDING'`;
      const [store] = await tx`select status from stores where id=${so.store_id}`;
      const result = settlementEligibility({ now: new Date(), policy: p ? { id: p.id, scope: p.scope, approved: p.approved,
        returnWindowHours: p.return_window_hours, settlementDelayHours: p.settlement_delay_hours } : null,
        deliveryPolicyId: e?.policy_version ?? null, confirmedAt: e?.confirmed_at ? new Date(e.confirmed_at) : null,
        deliveredAt: e?.delivered_at ? new Date(e.delivered_at) : null, paymentReconciled: !!payment &&
          ['SUCCEEDED','PARTIALLY_REFUNDED'].includes(payment.status) && Number(payment.amount_rial) === Number(payment.customer_total_rial) && Number(refundTotal?.amount) === Number(payment.refunded_rial),
        openCaseCount: open?.n ?? 1, pendingRefundCount: pending?.n ?? 1,
        riskHold: store?.status !== 'ACTIVE' || so.status !== 'DELIVERED', production: process.env.NODE_ENV === 'production' });
      return { ...result, scope: 'SANDBOX', executable: false, fundsReleased: false };
    });
  });
}
