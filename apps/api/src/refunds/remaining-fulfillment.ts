import { and, eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { marketplaceOrderItems, marketplaceRefundCases } from '../db/schema.js';

export async function remainingFulfillment(tx: Parameters<Parameters<typeof db.transaction>[0]>[0], sellerOrderId: string) {
  const items = await tx.select().from(marketplaceOrderItems).where(eq(marketplaceOrderItems.sellerOrderId, sellerOrderId));
  const cases = await tx.select().from(marketplaceRefundCases).where(and(
    eq(marketplaceRefundCases.sellerOrderId, sellerOrderId), eq(marketplaceRefundCases.status, 'REFUNDED'),
  ));
  return items.map(item => {
    const refundedQuantity = cases.some(c => !c.itemAllocation) ? item.quantity : cases.reduce((n, c) => n +
      (c.itemAllocation?.items.filter(i => i.itemId === item.id).reduce((q, i) => q + i.quantity, 0) ?? 0), 0);
    if (!Number.isSafeInteger(refundedQuantity) || refundedQuantity > item.quantity) throw new Error('REFUND_FULFILLMENT_QUANTITY_MISMATCH');
    return { itemId: item.id, name: item.productNameSnapshot, variantName: item.variantNameSnapshot,
      purchasedQuantity: item.quantity, refundedQuantity, remainingQuantity: item.quantity - refundedQuantity };
  });
}
