export type SettlementPolicy = { id: string; scope: 'SANDBOX'; approved: boolean; returnWindowHours: number; settlementDelayHours: number };
export function settlementEligibility(input: {
  now: Date; policy: SettlementPolicy | null; deliveryPolicyId: string | null;
  deliveredAt: Date | null; confirmedAt: Date | null; paymentReconciled: boolean;
  openCaseCount: number; pendingRefundCount: number; riskHold: boolean; production: boolean;
}) {
  const reasons: string[] = [];
  const policy = input.policy;
  if (!policy) return { eligible: false, reasons: ['POLICY_REQUIRED'], eligibleAt: null };
  const validTime = (value: Date | null): value is Date => value !== null && Number.isFinite(value.getTime()) && value <= input.now;
  const validHours = (n: number) => Number.isSafeInteger(n) && n >= 0 && n <= 24 * 366;
  if (!Number.isFinite(input.now.getTime()) || !policy.approved || !validHours(policy.returnWindowHours) || !validHours(policy.settlementDelayHours)) reasons.push('POLICY_INVALID');
  if (policy.id !== input.deliveryPolicyId) reasons.push('POLICY_VERSION_MISMATCH');
  if (input.production || policy.scope !== 'SANDBOX') reasons.push('LIVE_SERVICE_GATES_REQUIRED');
  let eligibleAt: Date | null = null;
  if (!validTime(input.deliveredAt) || !validTime(input.confirmedAt)) reasons.push('INDEPENDENT_DELIVERY_REQUIRED');
  else {
    const returnEnd = input.deliveredAt.getTime() + policy.returnWindowHours * 3_600_000;
    const delayEnd = input.confirmedAt.getTime() + policy.settlementDelayHours * 3_600_000;
    eligibleAt = new Date(Math.max(returnEnd, delayEnd));
    if (input.now.getTime() < returnEnd) reasons.push('RETURN_WINDOW_OPEN');
    if (input.now.getTime() < delayEnd) reasons.push('SETTLEMENT_DELAY_OPEN');
  }
  if (!input.paymentReconciled) reasons.push('PAYMENT_NOT_RECONCILED');
  if (!Number.isSafeInteger(input.openCaseCount) || input.openCaseCount !== 0) reasons.push('OPEN_DISPUTE');
  if (!Number.isSafeInteger(input.pendingRefundCount) || input.pendingRefundCount !== 0) reasons.push('PENDING_REFUND');
  if (input.riskHold) reasons.push('RISK_HOLD');
  return { eligible: reasons.length === 0, reasons, eligibleAt };
}
