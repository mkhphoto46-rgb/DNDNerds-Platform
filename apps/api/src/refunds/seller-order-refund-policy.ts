export type RefundScopeDecision = {
  kind: "FULL_PAYMENT" | "PARTIAL_PAYMENT";
  paymentAfterRefundRial: number;
  paymentStatus: "REFUNDED" | "PARTIALLY_REFUNDED";
};

/** Exact-integer policy gate. Never infer a PSP's partial-refund capability. */
export function decideSellerOrderRefundScope(input: {
  paymentAmountRial: number;
  alreadyRefundedRial: number;
  sellerRefundRial: number;
  providerCanPartialRefund: boolean;
}): RefundScopeDecision {
  const { paymentAmountRial, alreadyRefundedRial, sellerRefundRial, providerCanPartialRefund } = input;
  if (![paymentAmountRial, alreadyRefundedRial, sellerRefundRial].every(Number.isSafeInteger) ||
      paymentAmountRial <= 0 || alreadyRefundedRial < 0 || sellerRefundRial <= 0 ||
      alreadyRefundedRial > paymentAmountRial ||
      sellerRefundRial > paymentAmountRial - alreadyRefundedRial) {
    throw new Error("SELLER_REFUND_AMOUNT_INVALID");
  }
  // Provider capability is on the *original, pinned* payment provider.
  const fullOriginalPayment = alreadyRefundedRial === 0 && sellerRefundRial === paymentAmountRial;
  if (!fullOriginalPayment && providerCanPartialRefund !== true) {
    throw new Error("SELLER_REFUND_PARTIAL_PROVIDER_UNSUPPORTED");
  }
  const after = alreadyRefundedRial + sellerRefundRial;
  return {
    kind: fullOriginalPayment ? "FULL_PAYMENT" : "PARTIAL_PAYMENT",
    paymentAfterRefundRial: after,
    paymentStatus: after === paymentAmountRial ? "REFUNDED" : "PARTIALLY_REFUNDED",
  };
}
