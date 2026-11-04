// Marketplace money flow against a real database: a seller lists a product, a
// buyer orders and pays through the signed mock webhook, and the double-entry
// ledger stays balanced. Repeated requests and webhooks don't double anything.
import assert from "node:assert/strict";
import { createHmac, randomBytes, randomUUID } from "node:crypto";
import { after, before, test } from "node:test";

import { startApi, type TestApi } from "../support/api.js";

let api: TestApi;
before(async () => { api = await startApi(); });
after(async () => { await api?.stop(); });

const find = (value: unknown, key: string): unknown => {
  if (!value || typeof value !== "object") return undefined;
  if (key in (value as Record<string, unknown>)) return (value as Record<string, unknown>)[key];
  for (const child of Object.values(value as Record<string, unknown>)) {
    const found = find(child, key);
    if (found !== undefined) return found;
  }
  return undefined;
};
const ok = (response: { status: number; body: unknown }) =>
  assert.ok(response.status >= 200 && response.status < 300, `${response.status} ${JSON.stringify(response.body)}`);
const key = (label: string) => `${label}-${randomBytes(8).toString("hex")}`;
const address = { fullName: "Test Buyer", phone: "09120000000", province: "Tehran", city: "Tehran", addressLine1: "1 Example Street", postalCode: "1234567890" };

async function sql<T = Record<string, unknown>>(run: (client: any) => Promise<T>): Promise<T> {
  const postgres = (await import("postgres")).default;
  const client = postgres(process.env.DATABASE_URL!, { max: 1, onnotice: () => {} });
  try { return await run(client); } finally { await client.end(); }
}

// B52: every order route requires a verified buyer (email, mobile and evidence).
async function verifiedBuyer(label: string) {
  const buyer = await api.register(label);
  await sql((client) => client`update users set email_verified = true where id = ${buyer.userId}`);
  await sql((client) => client`insert into marketplace_buyer_verifications (user_id, mobile_verified_at, evidence_ref) values (${buyer.userId}, now(), 'synthetic-only')`);
  return buyer;
}

let adminUser: Awaited<ReturnType<TestApi["register"]>> | null = null;
async function marketplaceAdmin() {
  if (adminUser) return adminUser;
  adminUser = await api.register("admin");
  const userId = adminUser.userId;
  await sql((client) => client`insert into marketplace_admins (user_id, role) values (${userId}, 'MARKETPLACE_ADMIN')`);
  return adminUser;
}

async function sellerWithProduct(stock = 5, priceRial = 150000) {
  const seller = await api.register("seller");
  const slug = `store-${randomBytes(4).toString("hex")}`;
  const onboard = await api.request({ method: "POST", url: "/api/v1/seller/onboard", token: seller.token, payload: {
    displayName: "Test Seller", storeName: "Test Store", storeSlug: slug, description: "Dice, maps and minis for testing.", category: "games",
  } });
  ok(onboard);
  const storeId = (find(onboard.body, "storeId") ?? find(find(onboard.body, "store"), "id")) as string;
  assert.ok(storeId, JSON.stringify(onboard.body));
  // A marketplace admin approves the seller, which activates the store.
  const sellerId = (find(onboard.body, "sellerId") ?? find(find(onboard.body, "seller"), "id") ?? find(find(onboard.body, "sellerProfile"), "id")) as string;
  assert.ok(sellerId, JSON.stringify(onboard.body));
  const admin = await marketplaceAdmin();
  const approved = await api.request({ method: "POST", url: `/api/v1/admin/marketplace/sellers/${sellerId}/moderate`, token: admin.token, payload: { action: "APPROVE", password: admin.password, reason: "Test approval" } });
  ok(approved);
  const product = await api.request({ method: "POST", url: `/api/v1/seller/stores/${storeId}/products`, token: seller.token, payload: {
    slug: `dice-${randomBytes(3).toString("hex")}`, name: "Test Dice Set", description: "Seven polyhedral dice.", category: "dice", sku: key("sku"), priceRial, stock, publish: true,
  } });
  ok(product);
  const productId = (find(product.body, "productId") ?? find(find(product.body, "product"), "id") ?? find(product.body, "id")) as string;
  assert.ok(productId, JSON.stringify(product.body));
  return { seller, storeId, productId, priceRial };
}

async function signedWebhook(body: Record<string, unknown>) {
  const signature = createHmac("sha256", process.env.MOCK_PAYMENT_WEBHOOK_SECRET!).update(JSON.stringify(body)).digest("hex");
  return api.request({ method: "POST", url: "/api/v1/payments/webhooks/mock", payload: body, headers: { "x-dnd-mock-signature": signature } });
}

async function ledgerImbalance(): Promise<number> {
  const rows = await sql((client) => client`select transaction_id from financial_ledger_postings group by transaction_id having sum(amount_rial) <> 0`);
  return (rows as unknown[]).length;
}

test("order, pay through the signed webhook; the ledger balances and a replay changes nothing", async () => {
  const { productId, priceRial } = await sellerWithProduct();
  const buyer = await verifiedBuyer("buyer");
  const listed = await api.request({ method: "GET", url: "/api/v1/products" });
  assert.ok(JSON.stringify(listed.body).includes(productId), "published product is listed");

  const idempotencyKey = key("order");
  const order = await api.request({ method: "POST", url: "/api/v1/marketplace/orders", token: buyer.token, payload: { idempotencyKey, address, items: [{ productId, quantity: 2 }] } });
  ok(order);
  const orderId = (find(order.body, "orderId") ?? find(find(order.body, "order"), "id")) as string;
  assert.ok(orderId, JSON.stringify(order.body));
  const again = await api.request({ method: "POST", url: "/api/v1/marketplace/orders", token: buyer.token, payload: { idempotencyKey, address, items: [{ productId, quantity: 2 }] } });
  ok(again);
  assert.equal(find(again.body, "orderId") ?? find(find(again.body, "order"), "id"), orderId, "same idempotency key, same order");
  assert.ok(JSON.stringify(order.body).includes(String(priceRial * 2)) || JSON.stringify(order.body).includes(String(priceRial * 2 / 10)), "total covers two items");

  const intent = await api.request({ method: "POST", url: `/api/v1/marketplace/orders/${orderId}/payment-intent`, token: buyer.token, payload: { idempotencyKey: key("intent") } });
  ok(intent);
  const intentId = (find(intent.body, "intentId") ?? find(find(intent.body, "intent"), "id") ?? find(find(intent.body, "paymentIntent"), "id")) as string;
  assert.ok(intentId, JSON.stringify(intent.body));

  const forged = await api.request({ method: "POST", url: "/api/v1/payments/webhooks/mock", payload: { eventId: key("evt"), type: "payment.succeeded", intentId }, headers: { "x-dnd-mock-signature": "00".repeat(32) } });
  assert.equal(forged.status, 401);

  const event = { eventId: key("evt"), type: "payment.succeeded", intentId, providerPaymentId: key("pay") };
  ok(await signedWebhook(event));
  const replay = await signedWebhook(event);
  assert.ok(replay.status < 500, JSON.stringify(replay.body));

  const paid = await api.request({ method: "GET", url: `/api/v1/marketplace/orders/${orderId}`, token: buyer.token });
  ok(paid);
  assert.match(JSON.stringify(paid.body), /PAID|paid/, JSON.stringify(paid.body));
  assert.equal(await ledgerImbalance(), 0, "every ledger transaction sums to zero");

  const stranger = await api.register("stranger");
  assert.ok((await api.request({ method: "GET", url: `/api/v1/marketplace/orders/${orderId}`, token: stranger.token })).status >= 400, "another user can't read the order");
});

test("an order beyond the stock is refused; an unknown product too", async () => {
  const { productId } = await sellerWithProduct(1);
  const buyer = await verifiedBuyer("buyer2");
  const tooMany = await api.request({ method: "POST", url: "/api/v1/marketplace/orders", token: buyer.token, payload: { idempotencyKey: key("order"), address, items: [{ productId, quantity: 2 }] } });
  assert.ok(tooMany.status >= 400 && tooMany.status < 500, `${tooMany.status} ${JSON.stringify(tooMany.body)}`);
  const unknown = await api.request({ method: "POST", url: "/api/v1/marketplace/orders", token: buyer.token, payload: { idempotencyKey: key("order"), address, items: [{ productId: randomUUID(), quantity: 1 }] } });
  assert.ok(unknown.status >= 400 && unknown.status < 500, `${unknown.status} ${JSON.stringify(unknown.body)}`);
});

test('item refunds execute once per quantity, restore only selected units and conserve the paid ledger', async () => {
  const { productId, storeId, seller } = await sellerWithProduct(5, 100003);
  const buyer = await verifiedBuyer('partial-refund');
  const placed = await api.request({ method: 'POST', url: '/api/v1/marketplace/orders', token: buyer.token,
    payload: { idempotencyKey: key('partial'), address, items: [{ productId, quantity: 3 }] } });
  ok(placed);
  const orderId = (find(placed.body, 'orderId') ?? find(find(placed.body, 'order'), 'id')) as string;
  await sql(q => q.begin(async (tx: any) => {
    await tx`update marketplace_orders set customer_total_rial=customer_total_rial+11,shipping_total_rial=11 where id=${orderId}`;
    await tx`update marketplace_seller_orders set gross_rial=gross_rial+11,seller_net_rial=seller_net_rial+11,shipping_snapshot='{"feeRial":11}'::jsonb where order_id=${orderId}`;
  }));
  const intent = await api.request({ method: 'POST', url: `/api/v1/marketplace/orders/${orderId}/payment-intent`, token: buyer.token, payload: { idempotencyKey: key('partial-intent') } });
  ok(intent);
  ok(await signedWebhook({ eventId: key('event'), type: 'payment.succeeded', intentId: find(intent.body, 'intentId') ?? find(find(intent.body, 'intent'), 'id') ?? find(find(intent.body, 'paymentIntent'), 'id'), providerPaymentId: key('payment') }));
  const [line] = await sql<any[]>(q => q`select * from marketplace_order_items where order_id=${orderId}`);
  const { allocateItemRefund } = await import('../../src/refunds/item-refund-allocation.js');
  const { executeSellerOrderRefundCase } = await import('../../src/refunds/seller-order-refund-execution.js');
  process.env.DND_ENABLE_MOCK_SELLER_REFUNDS = 'true';
  const prior: ReturnType<typeof allocateItemRefund>[] = [];
  const admin = await marketplaceAdmin();
  for (let i = 0; i < 3; i++) {
    const scope = { items: [{ itemId: line.id, quantity: 1 }], shippingRial: i === 0 ? 3 : 4 };
    const plan = allocateItemRefund({ items: [{ itemId: line.id, quantity: 3, lineTotalRial: Number(line.line_total_rial), commissionRial: Number(line.commission_rial), sellerNetRial: Number(line.seller_net_rial) }], shippingRial: 11 }, scope, prior);
    const opened = await api.request({ method: 'POST', url: `/api/v1/marketplace/seller-orders/${line.seller_order_id}/refund-cases`, token: buyer.token,
      payload: { reason: 'DAMAGED', description: 'Synthetic detailed partial return for testing only.', scope } });
    assert.equal(opened.status, 201, JSON.stringify(opened.body));
    assert.deepEqual(opened.body.refundCase.requestedScope, scope);
    if (i === 0) {
      const conflict = await api.request({ method: 'POST', url: `/api/v1/marketplace/seller-orders/${line.seller_order_id}/refund-cases`, token: buyer.token,
        payload: { reason: 'DAMAGED', description: 'A conflicting active item selection must be rejected.', scope: { ...scope, shippingRial: 4 } } });
      assert.equal(conflict.status, 409);
    }
    // Seed evidence/contact review prerequisites; approval itself goes through the real admin command.
    const c = { id: opened.body.refundCase.id };
    await sql(q => q.begin(async (tx: any) => {
      await tx`update marketplace_refund_cases set status='UNDER_REVIEW',contact_confirmed_at=now() where id=${c.id}`;
      await tx`insert into marketplace_refund_case_evidence(case_id,uploaded_by_user_id,storage_key,original_name,mime_type,size_bytes,sha256)
        values(${c.id},${buyer.userId},${'synthetic/' + c.id},'synthetic.webp','image/webp',100,${'a'.repeat(64)})`;
    }));
    const approved = await api.request({ method: 'POST', url: `/api/v1/admin/marketplace/refund-cases/${c.id}/decision`, token: admin.token,
      payload: { action: 'APPROVE', returnRequired: false, password: admin.password, reason: 'Synthetic partial refund approval.' } });
    ok(approved);
    assert.deepEqual(approved.body.refundCase.itemAllocation, plan);
    if (i === 0) {
      const results = await Promise.allSettled(Array.from({ length: 100 }, () => executeSellerOrderRefundCase(c.id, admin.userId)));
      assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
    } else if (i === 1) {
      let execution: ReturnType<typeof executeSellerOrderRefundCase> | undefined;
      const heldShipment = await api.request({ method: 'POST', url: `/api/v1/seller/stores/${storeId}/orders/${line.seller_order_id}/fulfillment`, token: seller.token,
        payload: { action: 'SHIP', carrier: 'Synthetic carrier', trackingCode: 'synthetic-123', items: [{ itemId: line.id, quantity: 2 }] } });
      assert.equal(heldShipment.status, 409);
      assert.equal(heldShipment.body.error.code, 'FULFILLMENT_REFUND_HOLD');
      await sql(q => q.begin(async (tx: any) => {
        await tx`select pg_advisory_xact_lock(hashtextextended(${'seller-balance:' + storeId},0))`;
        const waiters = async (minimum: number) => {
          for (let tries = 0; tries < 300; tries++) {
            const [r] = await sql<any[]>(p => p`select count(*)::int as n from pg_locks where locktype='advisory' and not granted and objid=((hashtextextended(${'seller-balance:' + storeId},0) & 4294967295)::oid)`);
            if (r.n >= minimum) return;
            await new Promise(resolve => setTimeout(resolve, 10));
          }
          assert.fail('fulfillment and refund must be queued on the same store lock');
        };
        execution = executeSellerOrderRefundCase(c.id, admin.userId);
        await waiters(1);
        // Model an independently accepted shipment committing while finalization waits.
        // Normal new shipment commands above are conservatively held until refund resolution.
        await tx`update marketplace_seller_orders set status='SHIPPED' where id=${line.seller_order_id}`;
      }));
      await execution;
    } else await executeSellerOrderRefundCase(c.id, admin.userId);
    prior.push(plan);
    const [state] = await sql<any[]>(q => q`select status from marketplace_seller_orders where id=${line.seller_order_id}`);
    assert.equal(state.status, i === 2 ? 'REFUNDED' : i === 1 ? 'SHIPPED' : 'PAID');
    const [stock] = await sql<any[]>(q => q`select quantity_on_hand from inventory where variant_id=${line.variant_id}`);
    assert.equal(stock.quantity_on_hand, 3, 'shipped units must not return to sellable stock');
    if (i === 0) {
      const fulfillment = await api.request({ method: 'POST', url: `/api/v1/seller/stores/${storeId}/orders/${line.seller_order_id}/fulfillment`, token: seller.token,
        payload: { action: 'SHIP', carrier: 'Synthetic carrier', trackingCode: 'synthetic-123' } });
      assert.equal(fulfillment.status, 409, 'partial-refund fulfillment requires explicit remaining quantity acceptance');
      const dashboard = await api.request({ method: 'GET', url: '/api/v1/marketplace/v21/seller/dashboard', token: seller.token });
      const visible = dashboard.body.orders.find((o: any) => o.id === line.seller_order_id);
      assert.equal(visible.items[0].remainingQuantity, 2);
      const legacy = await api.request({ method: 'POST', url: `/api/v1/marketplace/seller-orders/${line.seller_order_id}/refund-cases`, token: buyer.token,
        payload: { reason: 'DAMAGED', description: 'A legacy whole-order request after a partial refund.' } });
      assert.equal(legacy.status, 409, 'a scopeless active case must not strand the remaining quantities');
    }
  }
  const [payment] = await sql<any[]>(q => q`select * from payments where order_id=${orderId}`);
  assert.equal(Number(payment.refunded_rial), 300020);
  assert.equal(payment.status, 'REFUNDED');
  const [lastRefund] = await sql<any[]>(q => q`select id from refunds where payment_id=${payment.id} order by succeeded_at desc limit 1`);
  const { finalizeSellerOrderRefund } = await import('../../src/refunds/seller-order-refund-execution.js');
  assert.equal((await finalizeSellerOrderRefund(lastRefund.id)).idempotent, true);
  const [unchanged] = await sql<any[]>(q => q`select quantity_on_hand from inventory where variant_id=${line.variant_id}`);
  assert.equal(unchanged.quantity_on_hand, 3);
  assert.equal(await ledgerImbalance(), 0);
});

test("B52: an order without buyer verification is refused on the direct order route", async () => {
  const { productId } = await sellerWithProduct();
  const unverified = await api.register("unverified");
  const order = await api.request({ method: "POST", url: "/api/v1/marketplace/orders", token: unverified.token, payload: { idempotencyKey: key("order"), address, items: [{ productId, quantity: 1 }] } });
  assert.equal(order.status, 403, JSON.stringify(order.body));
  assert.equal(find(order.body, "code"), "BUYER_VERIFICATION_REQUIRED");
});

test("B52: a store member can't order the store's own product", async () => {
  const { seller, productId } = await sellerWithProduct();
  await sql((client) => client`update users set email_verified = true where id = ${seller.userId}`);
  await sql((client) => client`insert into marketplace_buyer_verifications (user_id, mobile_verified_at, evidence_ref) values (${seller.userId}, now(), 'synthetic-only')`);
  const order = await api.request({ method: "POST", url: "/api/v1/marketplace/orders", token: seller.token, payload: { idempotencyKey: key("order"), address, items: [{ productId, quantity: 1 }] } });
  assert.equal(order.status, 403, JSON.stringify(order.body));
  assert.equal(find(order.body, "code"), "SELF_PURCHASE");
});
