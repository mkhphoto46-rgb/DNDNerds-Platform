import assert from 'node:assert/strict';
import { test } from 'node:test';
import { allocateItemRefund, type ItemRefundAllocation } from './item-refund-allocation.js';

const item = { itemId: 'a', quantity: 3, lineTotalRial: 100, commissionRial: 7, sellerNetRial: 93 };
const purchase = { items: [item], shippingRial: 11 };
test('partial quantities conserve every rial, including commission rounding and shipping', () => {
  const previous: ItemRefundAllocation[] = [];
  for (let n = 0; n < 3; n++) previous.push(allocateItemRefund(purchase,
    { items: [{ itemId: 'a', quantity: 1 }], shippingRial: n === 2 ? 11 : 0 }, previous));
  assert.deepEqual(previous.map(p => p.refundAmountRial), [33, 33, 45]);
  assert.equal(previous.reduce((s, p) => s + p.commissionReversalRial, 0), 7);
  assert.equal(previous.reduce((s, p) => s + p.sellerNetReversalRial, 0), 104);
  for (const p of previous) assert.equal(p.refundAmountRial, p.commissionReversalRial + p.sellerNetReversalRial);
  assert.throws(() => allocateItemRefund(purchase, { items: [{ itemId: 'a', quantity: 1 }], shippingRial: 0 }, previous), /QUANTITY/);
  assert.throws(() => allocateItemRefund(purchase, { items: [], shippingRial: 1 }, previous), /SHIPPING/);
});
test('rejects cross-order IDs, aliases, invalid quantities and inconsistent purchase snapshots', () => {
  const request = { items: [{ itemId: 'a', quantity: 1 }], shippingRial: 0 };
  for (const quantity of [0, -1, 0.5, 4, Number.MAX_SAFE_INTEGER + 1])
    assert.throws(() => allocateItemRefund(purchase, { ...request, items: [{ itemId: 'a', quantity }] }));
  assert.throws(() => allocateItemRefund(purchase, { ...request, items: [{ itemId: 'other', quantity: 1 }] }), /ITEM/);
  assert.throws(() => allocateItemRefund(purchase, { ...request, items: [...request.items, ...request.items] }), /DUPLICATE/);
  assert.throws(() => allocateItemRefund({ ...purchase, items: [{ ...item, sellerNetRial: 94 }] }, request), /SNAPSHOT/);
  assert.throws(() => allocateItemRefund(purchase, { items: [], shippingRial: 0 }), /EMPTY/);
});
test('history is revalidated against original snapshots; fabricated amounts cannot open refund headroom', () => {
  const first = allocateItemRefund(purchase, { items: [{ itemId: 'a', quantity: 1 }], shippingRial: 3 });
  assert.throws(() => allocateItemRefund(purchase, { items: [], shippingRial: 1 }, [{ ...first, refundAmountRial: 0 }]), /HISTORY/);
  assert.throws(() => allocateItemRefund(purchase, { items: [], shippingRial: 9 }, [first]), /SHIPPING/);
});
test('100 successive item refunds conserve large integer amounts without floating point multiplication', () => {
  const large = { items: [{ ...item, quantity: 100, lineTotalRial: 9_000_000_000_001, commissionRial: 123_456_789_101, sellerNetRial: 8_876_543_210_900 }], shippingRial: 101 };
  const history: ItemRefundAllocation[] = [];
  for (let i = 0; i < 100; i++) history.push(allocateItemRefund(large,
    { items: [{ itemId: 'a', quantity: 1 }], shippingRial: i === 99 ? 101 : 0 }, history));
  assert.equal(history.reduce((s, p) => s + p.refundAmountRial, 0), 9_000_000_000_102);
  assert.equal(history.reduce((s, p) => s + p.commissionReversalRial, 0), 123_456_789_101);
});
test('commission rounding never exceeds the refunded merchandise in a tiny discounted line', () => {
  const tiny = { items: [{ ...item, quantity: 5, lineTotalRial: 3, commissionRial: 2, sellerNetRial: 1 }], shippingRial: 1 };
  const first = allocateItemRefund(tiny, { items: [{ itemId: 'a', quantity: 2 }], shippingRial: 0 });
  const second = allocateItemRefund(tiny, { items: [{ itemId: 'a', quantity: 1 }], shippingRial: 1 }, [first]);
  assert.ok(second.commissionReversalRial <= second.refundAmountRial - second.shippingRial);
});

