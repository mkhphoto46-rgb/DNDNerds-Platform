import assert from 'node:assert/strict';
import { test } from 'node:test';
import { settlementEligibility } from './settlement-policy.js';
const now = new Date('2026-11-02T12:00:00Z');
const policy = { id: 'p1', scope: 'SANDBOX' as const, approved: true, returnWindowHours: 48, settlementDelayHours: 24 };
const input = { now, policy, deliveryPolicyId: 'p1', confirmedAt: new Date('2026-10-30T12:00:00Z'), deliveredAt: new Date('2026-10-30T12:00:00Z'),
  paymentReconciled: true, openCaseCount: 0, pendingRefundCount: 0, riskHold: false, production: false };
test('independent delivery plus the exact approved version controls eligibility, with no default time window', () => {
  assert.equal(settlementEligibility(input).eligible, true);
  assert.deepEqual(settlementEligibility({ ...input, policy: null }).reasons, ['POLICY_REQUIRED']);
  assert.ok(settlementEligibility({ ...input, deliveryPolicyId: 'p2' }).reasons.includes('POLICY_VERSION_MISMATCH'));
  assert.ok(settlementEligibility({ ...input, deliveredAt: new Date('2026-11-02T00:00:00Z') }).reasons.includes('RETURN_WINDOW_OPEN'));
  assert.ok(settlementEligibility({ ...input, confirmedAt: null }).reasons.includes('INDEPENDENT_DELIVERY_REQUIRED'));
});
test('disputes, pending money, risk holds and reconciliation each prevent release independently', () => {
  for (const changed of [{ openCaseCount: 1 }, { pendingRefundCount: 1 }, { riskHold: true }, { paymentReconciled: false }])
    assert.equal(settlementEligibility({ ...input, ...changed }).eligible, false);
});
test('sandbox approval can never authorize production money; invalid or future evidence fails closed', () => {
  assert.ok(settlementEligibility({ ...input, production: true }).reasons.includes('LIVE_SERVICE_GATES_REQUIRED'));
  assert.equal(settlementEligibility({ ...input, policy: { ...policy, returnWindowHours: -1 } }).eligible, false);
  assert.equal(settlementEligibility({ ...input, confirmedAt: new Date('2026-11-03') }).eligible, false);
});
