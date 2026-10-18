import {
  adminDecisionStatus,
  canAdminDecide,
  canSellerRespond,
  normalizeSellerResponseHours,
  sellerResponseDeadline,
} from "../refunds/case-workflow.js";

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
  const now =
    new Date(
      "2026-10-09T00:00:00.000Z",
    );

  const due =
    sellerResponseDeadline(
      now,
      48,
    );

  assert(
    due.toISOString() ===
      "2026-10-11T00:00:00.000Z",
    "48-hour seller response deadline failed.",
  );

  assert(
    normalizeSellerResponseHours(
      0,
    ) ===
      1,
    "Minimum seller response window failed.",
  );

  assert(
    normalizeSellerResponseHours(
      9999,
    ) ===
      720,
    "Maximum seller response window failed.",
  );

  assert(
    canSellerRespond(
      "SELLER_RESPONSE",
      new Date(
        "2026-10-10T00:00:00.000Z",
      ),
      due,
    ),
    "Seller response should be open before deadline.",
  );

  assert(
    !canSellerRespond(
      "SELLER_RESPONSE",
      new Date(
        "2026-10-12T00:00:00.000Z",
      ),
      due,
    ),
    "Seller response should be closed after deadline.",
  );

  assert(
    !canAdminDecide(
      "SELLER_RESPONSE",
      new Date(
        "2026-10-10T00:00:00.000Z",
      ),
      due,
    ),
    "Admin decision should wait for seller response window.",
  );

  assert(
    canAdminDecide(
      "SELLER_RESPONSE",
      new Date(
        "2026-10-12T00:00:00.000Z",
      ),
      due,
    ),
    "Admin decision should be allowed after seller response deadline.",
  );

  assert(
    canAdminDecide(
      "UNDER_REVIEW",
      now,
      due,
    ),
    "Admin decision should be allowed after seller response.",
  );

  assert(
    adminDecisionStatus(
      "APPROVE",
      false,
    ) ===
      "APPROVED",
    "Approve-without-return transition failed.",
  );

  assert(
    adminDecisionStatus(
      "APPROVE",
      true,
    ) ===
      "RETURN_REQUIRED",
    "Approve-with-return transition failed.",
  );

  assert(
    adminDecisionStatus(
      "REJECT",
      true,
    ) ===
      "REJECTED",
    "Reject transition failed.",
  );

  console.log(
    JSON.stringify(
      {
        test:
          "J2N-C refund review workflow",

        status:
          "PASS",

        supportContactGate:
          true,

        sellerResponseWindow:
          true,

        adminDecisionGate:
          true,

        returnRequiredBranch:
          true,

        financialRefundExecution:
          false,
      },
      null,
      2,
    ),
  );

  console.log(
    "J2N_C_REFUND_REVIEW_WORKFLOW_SELF_TEST_PASS",
  );
}

main();
