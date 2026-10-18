export type SellerBalanceSnapshot = {
  pendingRial: number;
  availableRial: number;
  negativeRial: number;
  paidOutRial: number;
};

function assertNonNegative(
  value: number,
  name: string,
) {
  if (
    !Number.isSafeInteger(
      value,
    ) ||
    value < 0
  ) {
    throw new Error(
      `${name} must be a non-negative safe integer.`,
    );
  }
}

function validateBalance(
  balance:
    SellerBalanceSnapshot,
) {
  assertNonNegative(
    balance.pendingRial,
    "pendingRial",
  );

  assertNonNegative(
    balance.availableRial,
    "availableRial",
  );

  assertNonNegative(
    balance.negativeRial,
    "negativeRial",
  );

  assertNonNegative(
    balance.paidOutRial,
    "paidOutRial",
  );
}

export function applyRefundClawback(
  balance:
    SellerBalanceSnapshot,
  amountRial: number,
): SellerBalanceSnapshot {
  validateBalance(
    balance,
  );

  assertNonNegative(
    amountRial,
    "amountRial",
  );

  let remaining =
    amountRial;

  const fromPending =
    Math.min(
      balance.pendingRial,
      remaining,
    );

  remaining -=
    fromPending;

  const fromAvailable =
    Math.min(
      balance.availableRial,
      remaining,
    );

  remaining -=
    fromAvailable;

  return {
    pendingRial:
      balance.pendingRial -
      fromPending,

    availableRial:
      balance.availableRial -
      fromAvailable,

    negativeRial:
      balance.negativeRial +
      remaining,

    paidOutRial:
      balance.paidOutRial,
  };
}

export function releaseDeliveredFunds(
  balance:
    SellerBalanceSnapshot,
  amountRial: number,
): SellerBalanceSnapshot {
  validateBalance(
    balance,
  );

  assertNonNegative(
    amountRial,
    "amountRial",
  );

  if (
    balance.pendingRial <
    amountRial
  ) {
    throw new Error(
      "SELLER_PENDING_BALANCE_INSUFFICIENT",
    );
  }

  const clawbackOffset =
    Math.min(
      balance.negativeRial,
      amountRial,
    );

  return {
    pendingRial:
      balance.pendingRial -
      amountRial,

    availableRial:
      balance.availableRial +
      (
        amountRial -
        clawbackOffset
      ),

    negativeRial:
      balance.negativeRial -
      clawbackOffset,

    paidOutRial:
      balance.paidOutRial,
  };
}

export function releasePayoutReservation(
  balance:
    SellerBalanceSnapshot,
  amountRial: number,
): SellerBalanceSnapshot {
  validateBalance(
    balance,
  );

  assertNonNegative(
    amountRial,
    "amountRial",
  );

  const clawbackOffset =
    Math.min(
      balance.negativeRial,
      amountRial,
    );

  return {
    pendingRial:
      balance.pendingRial,

    availableRial:
      balance.availableRial +
      (
        amountRial -
        clawbackOffset
      ),

    negativeRial:
      balance.negativeRial -
      clawbackOffset,

    paidOutRial:
      balance.paidOutRial,
  };
}
