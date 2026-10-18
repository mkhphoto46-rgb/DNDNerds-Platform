export type RefundCaseWorkflowStatus =
  | "REQUESTED"
  | "EVIDENCE_REQUIRED"
  | "CONTACT_REQUIRED"
  | "UNDER_REVIEW"
  | "SELLER_RESPONSE"
  | "RETURN_REQUIRED"
  | "APPROVED"
  | "REJECTED"
  | "REFUND_PROCESSING"
  | "REFUNDED"
  | "CLOSED";

export type RefundCaseDecision =
  | "APPROVE"
  | "REJECT";

const MIN_SELLER_RESPONSE_HOURS =
  1;

const MAX_SELLER_RESPONSE_HOURS =
  30 * 24;

export function normalizeSellerResponseHours(
  value:
    number,
) {
  if (
    !Number.isFinite(
      value,
    )
  ) {
    return 48;
  }

  return Math.min(
    Math.max(
      Math.trunc(
        value,
      ),
      MIN_SELLER_RESPONSE_HOURS,
    ),
    MAX_SELLER_RESPONSE_HOURS,
  );
}

export function sellerResponseDeadline(
  now:
    Date,
  responseHours:
    number,
) {
  const hours =
    normalizeSellerResponseHours(
      responseHours,
    );

  return new Date(
    now.getTime() +
      hours *
        60 *
        60 *
        1000,
  );
}

export function canSellerRespond(
  status:
    RefundCaseWorkflowStatus,
  now:
    Date,
  dueAt:
    Date |
    null,
) {
  return (
    status ===
      "SELLER_RESPONSE" &&
    dueAt !==
      null &&
    now.getTime() <=
      dueAt.getTime()
  );
}

export function canAdminDecide(
  status:
    RefundCaseWorkflowStatus,
  now:
    Date,
  dueAt:
    Date |
    null,
) {
  if (
    status ===
    "UNDER_REVIEW"
  ) {
    return true;
  }

  return (
    status ===
      "SELLER_RESPONSE" &&
    dueAt !==
      null &&
    now.getTime() >=
      dueAt.getTime()
  );
}

export function adminDecisionStatus(
  action:
    RefundCaseDecision,
  returnRequired:
    boolean,
) {
  if (
    action ===
    "REJECT"
  ) {
    return "REJECTED" as const;
  }

  return (
    returnRequired
      ? "RETURN_REQUIRED" as const
      : "APPROVED" as const
  );
}
