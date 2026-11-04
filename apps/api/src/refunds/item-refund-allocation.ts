/** Immutable paid snapshots only. No current product price or commission policy is consulted. */
export type RefundPurchase = {
  items: { itemId: string; quantity: number; lineTotalRial: number; commissionRial: number; sellerNetRial: number }[];
  shippingRial: number;
};
export type ItemRefundRequest = { items: { itemId: string; quantity: number }[]; shippingRial: number };
export type ItemRefundAllocation = {
  version: 1;
  items: { itemId: string; quantity: number; refundAmountRial: number; commissionReversalRial: number; sellerNetReversalRial: number }[];
  shippingRial: number;
  refundAmountRial: number;
  commissionReversalRial: number;
  sellerNetReversalRial: number;
};
function fail(code: string): never { throw new Error(`ITEM_REFUND_${code}`); }
function integer(n: number, code: string) {
  if (!Number.isSafeInteger(n) || n < 0) fail(code);
  return n;
}
function sum(a: number, b: number) { return integer(a + b, 'OVERFLOW'); }
// Cumulative rounding means a final unit consumes the remainder exactly. BigInt avoids
// intermediate multiplication losing a rial even when both inputs are safe integers.
function slice(total: number, before: number, count: number, quantity: number) {
  return Number(BigInt(total) * BigInt(before + count) / BigInt(quantity)
    - BigInt(total) * BigInt(before) / BigInt(quantity));
}
export function allocateItemRefund(
  purchase: RefundPurchase, request: ItemRefundRequest, previous: readonly ItemRefundAllocation[] = [],
): ItemRefundAllocation {
  integer(purchase.shippingRial, 'SNAPSHOT');
  const originals = new Map(purchase.items.map(item => [item.itemId, item]));
  if (!purchase.items.length || originals.size !== purchase.items.length) fail('SNAPSHOT');
  for (const item of purchase.items) {
    integer(item.quantity, 'SNAPSHOT'); integer(item.lineTotalRial, 'SNAPSHOT');
    integer(item.commissionRial, 'SNAPSHOT'); integer(item.sellerNetRial, 'SNAPSHOT');
    if (!item.itemId || item.quantity < 1 || sum(item.commissionRial, item.sellerNetRial) !== item.lineTotalRial) fail('SNAPSHOT');
  }
  const refunded = new Map<string, number>();
  let shippingUsed = 0;
  function allocate(input: ItemRefundRequest): ItemRefundAllocation {
    integer(input.shippingRial, 'SHIPPING');
    if (sum(shippingUsed, input.shippingRial) > purchase.shippingRial) fail('SHIPPING');
    const seen = new Set<string>();
    const items = input.items.map(selected => {
      if (seen.has(selected.itemId)) fail('DUPLICATE');
      seen.add(selected.itemId);
      const original = originals.get(selected.itemId);
      if (!original) fail('ITEM');
      integer(selected.quantity, 'QUANTITY');
      const before = refunded.get(selected.itemId) ?? 0;
      if (selected.quantity < 1 || sum(before, selected.quantity) > original.quantity) fail('QUANTITY');
      const refundAmountRial = slice(original.lineTotalRial, before, selected.quantity, original.quantity);
      const grossBefore = slice(original.lineTotalRial, 0, before, original.quantity);
      const commissionReversalRial = original.lineTotalRial === 0 ? 0
        : slice(original.commissionRial, grossBefore, refundAmountRial, original.lineTotalRial);
      const sellerNetReversalRial = refundAmountRial - commissionReversalRial;
      if (sellerNetReversalRial < 0) fail('SNAPSHOT');
      refunded.set(selected.itemId, before + selected.quantity);
      return { itemId: selected.itemId, quantity: selected.quantity, refundAmountRial, commissionReversalRial, sellerNetReversalRial };
    });
    shippingUsed += input.shippingRial;
    const refundAmountRial = items.reduce((n, item) => sum(n, item.refundAmountRial), input.shippingRial);
    const commissionReversalRial = items.reduce((n, item) => sum(n, item.commissionReversalRial), 0);
    if (refundAmountRial < 1) fail('EMPTY');
    return { version: 1, items, shippingRial: input.shippingRial, refundAmountRial,
      commissionReversalRial, sellerNetReversalRial: refundAmountRial - commissionReversalRial };
  }
  for (const prior of previous) {
    const expected = allocate(prior);
    if (prior.version !== 1 || prior.refundAmountRial !== expected.refundAmountRial ||
        prior.commissionReversalRial !== expected.commissionReversalRial ||
        prior.sellerNetReversalRial !== expected.sellerNetReversalRial ||
        prior.items.some((line, index) => {
          const e = expected.items[index]!;
          return line.refundAmountRial !== e.refundAmountRial || line.commissionReversalRial !== e.commissionReversalRial ||
            line.sellerNetReversalRial !== e.sellerNetReversalRial;
        })) fail('HISTORY');
  }
  return allocate(request);
}
