export function calculateCommission(
  grossAmount: number,
  commissionBps: number,
) {
  return Math.round(
    grossAmount *
      commissionBps /
      10000,
  );
}

export function bpsToPercent(
  commissionBps: number,
) {
  return commissionBps / 100;
}