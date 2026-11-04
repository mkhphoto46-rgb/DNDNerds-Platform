import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import { startApi, type TestApi } from '../support/api.js';
import postgres from 'postgres';
import { createHmac, randomUUID } from 'node:crypto';
let api: TestApi;
let author: Awaited<ReturnType<TestApi['register']>>;
let reviewer: Awaited<ReturnType<TestApi['register']>>;
const base = '/api/v1/marketplace/v21/admin';
let policyId: string;
const find = (value: any, key: string): any => {
  if (!value || typeof value !== 'object') return undefined;
  if (key in value) return value[key];
  for (const child of Object.values(value)) { const r = find(child, key); if (r !== undefined) return r; }
};
async function sql<T>(run: (q: ReturnType<typeof postgres>) => Promise<T>) {
  const q = postgres(process.env.DATABASE_URL!, { max: 1 }); try { return await run(q); } finally { await q.end(); }
}
before(async () => {
  api = await startApi(); author = await api.register('policy-author'); reviewer = await api.register('policy-reviewer');
  const q = postgres(process.env.DATABASE_URL!, { max: 1 });
  try { for (const a of [author, reviewer]) await q`insert into marketplace_admins(user_id,role) values(${a.userId},'MARKETPLACE_ADMIN')`; }
  finally { await q.end(); }
});
after(async () => { await api?.stop(); });
test('sandbox payout policies require explicit windows, an independent approver, and immutable revisions', async () => {
  const payload = { name: 'Synthetic manual review policy', returnWindowHours: 48, settlementDelayHours: 24, evidenceRef: 'synthetic-written-policy', reason: 'Synthetic controlled policy test.', password: author.password };
  const missing = await api.request({ method: 'POST', url: `${base}/payout-policies`, token: author.token, payload: { ...payload, returnWindowHours: undefined } });
  assert.equal(missing.status, 400);
  const made = await api.request({ method: 'POST', url: `${base}/payout-policies`, token: author.token, payload });
  assert.equal(made.status, 201, JSON.stringify(made.body));
  assert.equal(made.body.scope, 'SANDBOX');
  policyId = made.body.id;
  const path = `${base}/payout-policies/${made.body.id}/approve`;
  const approve = (actor: typeof author) => api.request({ method: 'POST', url: path, token: actor.token, payload: { password: actor.password, reason: 'Independent synthetic policy review.' } });
  assert.equal((await approve(author)).status, 409);
  assert.equal((await approve(reviewer)).status, 200);
  const listed = await api.request({ method: 'GET', url: `${base}/payout-policies`, token: reviewer.token });
  assert.equal(listed.status, 200, JSON.stringify(listed.body));
  assert.equal(listed.body.data[0].approved, true);
  assert.equal((await approve(reviewer)).status, 200);
  const q = postgres(process.env.DATABASE_URL!, { max: 1 });
  try { await assert.rejects(q`update marketplace_payout_policies set return_window_hours=0 where id=${made.body.id}`); }
  finally { await q.end(); }
});
test('independent evidence marks delivery without releasing money; self-review and early eligibility are refused', async () => {
  const buyer = await api.register('delivery-buyer');
  await sql(async q => { await q`update users set email_verified=true where id=${buyer.userId}`; await q`insert into marketplace_buyer_verifications(user_id,mobile_verified_at,evidence_ref) values(${buyer.userId},now(),'synthetic-only')`; });
  const slug = 'qa-' + randomUUID().slice(0, 8);
  const onboard = await api.request({ method: 'POST', url: '/api/v1/seller/onboard', token: author.token,
    payload: { displayName: 'Synthetic Seller', storeName: 'Synthetic Workshop', storeSlug: slug, description: 'Synthetic fixture for independent delivery.', category: 'dice' } });
  assert.equal(onboard.status, 201, JSON.stringify(onboard.body));
  const fixture = await sql(async q => {
    const [s] = await q`update stores set status='ACTIVE' where slug=${slug} returning id`;
    const [p] = await q`insert into products(store_id,slug,name,description,category,status) values(${s!.id},'dice','Synthetic dice','Synthetic physical product','dice','PUBLISHED') returning id`;
    const [v] = await q`insert into product_variants(product_id,sku,name,price_rial,is_default) values(${p!.id},${randomUUID()},'Default',100000,true) returning id`;
    await q`insert into inventory(variant_id,quantity_on_hand) values(${v!.id},5)`;
    return { storeId: s!.id, productId: p!.id };
  });
  const placed = await api.request({ method: 'POST', url: '/api/v1/marketplace/orders', token: buyer.token, payload: { idempotencyKey: randomUUID(),
    address: { fullName: 'Synthetic Buyer', phone: '09120000000', province: 'Tehran', city: 'Tehran', addressLine1: 'Synthetic street', postalCode: '1234567890' }, items: [{ productId: fixture.productId, quantity: 1 }] } });
  assert.equal(placed.status, 201, JSON.stringify(placed.body));
  const orderId = find(placed.body, 'orderId') ?? find(find(placed.body, 'order'), 'id');
  const intent = await api.request({ method: 'POST', url: `/api/v1/marketplace/orders/${orderId}/payment-intent`, token: buyer.token, payload: { idempotencyKey: randomUUID() } });
  assert.equal(intent.status, 201);
  const intentId = find(intent.body, 'intentId') ?? find(find(intent.body, 'intent'), 'id') ?? find(find(intent.body, 'paymentIntent'), 'id');
  const event = { eventId: randomUUID(), type: 'payment.succeeded', intentId, providerPaymentId: randomUUID() };
  const signature = createHmac('sha256', process.env.MOCK_PAYMENT_WEBHOOK_SECRET!).update(JSON.stringify(event)).digest('hex');
  assert.equal((await api.request({ method: 'POST', url: '/api/v1/payments/webhooks/mock', payload: event, headers: { 'x-dnd-mock-signature': signature } })).status, 200);
  const [so] = await sql(q => q`select id from marketplace_seller_orders where order_id=${orderId}`);
  const shipped = await api.request({ method: 'POST', url: `/api/v1/seller/stores/${fixture.storeId}/orders/${so!.id}/fulfillment`, token: author.token,
    payload: { action: 'SHIP', carrier: 'Synthetic carrier', trackingCode: 'synthetic-001' } });
  assert.equal(shipped.status, 200, JSON.stringify(shipped.body));
  const media = await api.request({ method: 'POST', url: '/api/v1/marketplace/v21/media', token: reviewer.token,
    payload: { dataWebp: 'data:image/webp;base64,UklGRjQAAABXRUJQVlA4ICgAAACQAQCdASoBAAEAAUAmJaACdLoAA5gA/vIiX/xaHWh1oaOu7D5aiAAA' } });
  assert.equal(media.status, 201, JSON.stringify(media.body));
  const before = await sql(q => q`select * from seller_balances where store_id=${fixture.storeId}`);
  const payload = { policyId, mediaId: media.body.id, deliveredAt: new Date().toISOString(), password: reviewer.password, reason: 'Independent synthetic carrier evidence reviewed.' };
  const path = `${base}/seller-orders/${so!.id}/delivery-review`;
  const self = await api.request({ method: 'POST', url: path, token: author.token, payload: { ...payload, password: author.password } });
  assert.equal(self.status, 403);
  const revokePolicy = await api.request({ method: 'POST', url: `${base}/payout-policies`, token: author.token, payload: {
    name: 'Synthetic revocation race', returnWindowHours: 48, settlementDelayHours: 24, evidenceRef: 'synthetic-race-policy', reason: 'Synthetic policy revocation race.', password: author.password } });
  assert.equal(revokePolicy.status, 201);
  assert.equal((await api.request({ method: 'POST', url: `${base}/payout-policies/${revokePolicy.body.id}/approve`, token: reviewer.token,
    payload: { reason: 'Independent race fixture approval.', password: reviewer.password } })).status, 200);
  let raced: ReturnType<TestApi['request']> | undefined;
  await sql(q => q.begin(async tx => {
    await tx`select id from marketplace_payout_policies where id=${revokePolicy.body.id} for update`;
    raced = api.request({ method: 'POST', url: path, token: reviewer.token, payload: { ...payload, policyId: revokePolicy.body.id } });
    let waiting = false;
    for (let tries = 0; tries < 300 && !waiting; tries++) {
      const [w] = await sql(p => p`select count(*)::int n from pg_stat_activity where datname=current_database() and wait_event_type='Lock' and query like '%marketplace_payout_policies%'`);
      waiting = Number(w?.n) > 0; if (!waiting) await new Promise(resolve => setTimeout(resolve, 10));
    }
    assert.ok(waiting, 'delivery must wait behind policy revocation');
    await tx`insert into marketplace_payout_policy_revocations(policy_id,revoked_by,reason) values(${revokePolicy.body.id},${reviewer.userId},'Synthetic revocation won the policy lock')`;
  }));
  assert.equal((await raced!).status, 409, 'delivery must observe revocation committed while its policy lock waited');
  const reviewed = await api.request({ method: 'POST', url: path, token: reviewer.token, payload });
  assert.equal(reviewed.status, 200, JSON.stringify(reviewed.body));
  assert.equal(reviewed.body.fundsReleased, false);
  assert.equal((await api.request({ method: 'POST', url: path, token: reviewer.token, payload })).body.idempotent, true);
  const after = await sql(q => q`select * from seller_balances where store_id=${fixture.storeId}`);
  assert.deepEqual([...after], [...before]);
  const eligibility = await api.request({ method: 'GET', url: `${base}/seller-orders/${so!.id}/settlement-eligibility`, token: reviewer.token });
  assert.equal(eligibility.status, 200, JSON.stringify(eligibility.body));
  assert.equal(eligibility.body.eligible, false);
  assert.ok(eligibility.body.reasons.includes('RETURN_WINDOW_OPEN'));
  assert.equal(eligibility.body.executable, false);
  const revoked = await api.request({ method: 'POST', url: `${base}/payout-policies/${policyId}/revoke`, token: reviewer.token,
    payload: { password: reviewer.password, reason: 'Synthetic revocation must prevent future eligibility.' } });
  assert.equal(revoked.status, 200);
  const blocked = await api.request({ method: 'GET', url: `${base}/seller-orders/${so!.id}/settlement-eligibility`, token: reviewer.token });
  assert.ok(blocked.body.reasons.includes('POLICY_INVALID'));
  assert.equal((await api.request({ method: 'POST', url: `${base}/payout-policies/${policyId}/approve`, token: reviewer.token,
    payload: { password: reviewer.password, reason: 'A revoked immutable revision cannot be reopened.' } })).status, 409);
});
