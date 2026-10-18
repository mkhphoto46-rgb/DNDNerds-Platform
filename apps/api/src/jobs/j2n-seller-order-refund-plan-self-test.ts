import {
  buildSellerOrderRefundPlan,
  hasCompleteRefundPlan,
} from "../refunds/seller-order-refund-plan.js";

function assert(
  condition:
    unknown,
  message:
    string,
) {
  if (!condition) {
    throw new Error(
      message,
    );
  }
}

function main() {
  const plan =
    buildSellerOrderRefundPlan({
      grossRial:
        1_000_000,

      platformCommissionRial:
        50_000,

      sellerNetRial:
        950_000,
    });

  assert(
    plan.refundAmountRial ===
      1_000_000,
    "Refund amount snapshot failed.",
  );

  assert(
    plan.commissionReversalRial ===
      50_000,
    "Commission reversal snapshot failed.",
  );

  assert(
    plan.sellerNetReversalRial ===
      950_000,
    "Seller-net reversal snapshot failed.",
  );

  assert(
    hasCompleteRefundPlan({
      ...plan,

      financialPlanCreatedAt:
        new Date(),
    }),
    "Complete refund plan validation failed.",
  );

  let unbalancedRejected =
    false;

  try {
    buildSellerOrderRefundPlan({
      grossRial:
        1_000_000,

      platformCommissionRial:
        100_000,

      sellerNetRial:
        950_000,
    });
  }
  catch {
    unbalancedRejected =
      true;
  }

  assert(
    unbalancedRejected,
    "Unbalanced seller-order refund plan was not rejected.",
  );

  console.log(
    JSON.stringify(
      {
        test:
          "J2N-D1 seller-order refund plan",

        status:
          "PASS",

        sellerOrderScoped:
          true,

        commissionSnapshot:
          true,

        sellerNetSnapshot:
          true,

        balancedPlanRequired:
          true,

        financialRefundExecution:
          false,
      },
      null,
      2,
    ),
  );

  console.log(
    "J2N_D1_SELLER_ORDER_REFUND_PLAN_SELF_TEST_PASS",
  );
}

main();
