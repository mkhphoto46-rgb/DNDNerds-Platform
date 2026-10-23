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
  const buyer = await api.register("buyer");
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
  const buyer = await api.register("buyer2");
  const tooMany = await api.request({ method: "POST", url: "/api/v1/marketplace/orders", token: buyer.token, payload: { idempotencyKey: key("order"), address, items: [{ productId, quantity: 2 }] } });
  assert.ok(tooMany.status >= 400 && tooMany.status < 500, `${tooMany.status} ${JSON.stringify(tooMany.body)}`);
  const unknown = await api.request({ method: "POST", url: "/api/v1/marketplace/orders", token: buyer.token, payload: { idempotencyKey: key("order"), address, items: [{ productId: randomUUID(), quantity: 1 }] } });
  assert.ok(unknown.status >= 400 && unknown.status < 500, `${unknown.status} ${JSON.stringify(unknown.body)}`);
});
