import { and, asc, eq, sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import { marketplaceOrderItems, marketplaceRefundCases } from '../db/schema.js';
import { allocateItemRefund, type ItemRefundRequest } from './item-refund-allocation.js';

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
/** Caller must hold refund:<parent-order-id> for both approval and execution. */
export async function buildItemRefundSnapshot(tx: Tx, sellerOrderId: string, request: ItemRefundRequest) {
  const lines = await tx.select().from(marketplaceOrderItems).where(eq(marketplaceOrderItems.sellerOrderId, sellerOrderId));
  const shipping = await tx.execute(sql`SELECT shipping_snapshot FROM marketplace_seller_orders WHERE id=${sellerOrderId}`);
  const snapshot = shipping[0]?.shipping_snapshot as { feeRial?: number } | null;
  const completed = await tx.select().from(marketplaceRefundCases).where(and(
    eq(marketplaceRefundCases.sellerOrderId, sellerOrderId), eq(marketplaceRefundCases.status, 'REFUNDED'),
  )).orderBy(asc(marketplaceRefundCases.financialPlanCreatedAt), asc(marketplaceRefundCases.id));
  if (completed.some(c => !c.itemAllocation)) throw new Error('ITEM_REFUND_LEGACY_FULL_REFUND');
  return allocateItemRefund({
    shippingRial: Number(snapshot?.feeRial ?? 0),
    items: lines.map(l => ({ itemId: l.id, quantity: l.quantity, lineTotalRial: l.lineTotalRial,
      commissionRial: l.commissionRial, sellerNetRial: l.sellerNetRial })),
  }, request, completed.map(c => c.itemAllocation!));
}
