export type SellerOrderRefundSnapshot = {
  grossRial: number;
  platformCommissionRial: number;
  sellerNetRial: number;
};

export type SellerOrderRefundPlan = {
  refundAmountRial: number;
  commissionReversalRial: number;
  sellerNetReversalRial: number;
};

function assertNonNegativeInteger(
  value:
    number,
  label:
    string,
) {
  if (
    !Number.isSafeInteger(
      value,
    ) ||
    value <
      0
  ) {
    throw new Error(
      `INVALID_REFUND_PLAN_${label}`,
    );
  }
}

export function buildSellerOrderRefundPlan(
  snapshot:
    SellerOrderRefundSnapshot,
):
  SellerOrderRefundPlan {
  assertNonNegativeInteger(
    snapshot.grossRial,
    "GROSS",
  );

  assertNonNegativeInteger(
    snapshot.platformCommissionRial,
    "COMMISSION",
  );

  assertNonNegativeInteger(
    snapshot.sellerNetRial,
    "SELLER_NET",
  );

  if (
    snapshot.grossRial <=
      0
  ) {
    throw new Error(
      "INVALID_REFUND_PLAN_ZERO_GROSS",
    );
  }

  if (
    snapshot.platformCommissionRial +
      snapshot.sellerNetRial !==
    snapshot.grossRial
  ) {
    throw new Error(
      "INVALID_REFUND_PLAN_UNBALANCED",
    );
  }

  return {
    refundAmountRial:
      snapshot.grossRial,

    commissionReversalRial:
      snapshot.platformCommissionRial,

    sellerNetReversalRial:
      snapshot.sellerNetRial,
  };
}

export function hasCompleteRefundPlan(
  input: {
    refundAmountRial:
      number |
      null;

    commissionReversalRial:
      number |
      null;

    sellerNetReversalRial:
      number |
      null;

    financialPlanCreatedAt:
      Date |
      null;
  },
) {
  if (
    input.refundAmountRial ===
      null ||
    input.commissionReversalRial ===
      null ||
    input.sellerNetReversalRial ===
      null ||
    input.financialPlanCreatedAt ===
      null
  ) {
    return false;
  }

  try {
    buildSellerOrderRefundPlan({
      grossRial:
        input.refundAmountRial,

      platformCommissionRial:
        input.commissionReversalRial,

      sellerNetRial:
        input.sellerNetReversalRial,
    });

    return true;
  }
  catch {
    return false;
  }
}
