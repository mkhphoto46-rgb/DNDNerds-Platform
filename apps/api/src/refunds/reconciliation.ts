import {
  eq,
} from "drizzle-orm";

import {
  db,
} from "../db/client.js";

import {
  refunds,
} from "../db/schema.js";

import {
  finalizeSuccessfulRefund,
} from "../payments/payment-service.js";
import { finalizeSellerOrderRefund } from "./seller-order-refund-execution.js";
import { marketplaceRefundCases } from "../db/schema.js";

import {
  findRefundProvider,
} from "../providers/refund/registry.js";

export async function reconcileRefund(
  refundId: string,
) {
  const [
    refund,
  ] =
    await db
      .select()
      .from(
        refunds,
      )
      .where(
        eq(
          refunds.id,
          refundId,
        ),
      )
      .limit(1);

  if (!refund) {
    return {
      outcome:
        "NOT_FOUND" as const,
    };
  }

  if (
    refund.status ===
    "SUCCEEDED"
  ) {
    return {
      outcome:
        "SUCCEEDED" as const,

      idempotent:
        true,

      refundId:
        refund.id,
    };
  }

  if (
    refund.status ===
    "FAILED"
  ) {
    return {
      outcome:
        "FAILED" as const,

      idempotent:
        true,

      refundId:
        refund.id,
    };
  }

  const adapter =
    findRefundProvider(
      refund.provider,
    );

  if (!adapter) {
    return {
      outcome:
        "ADAPTER_MISSING" as const,

      refundId:
        refund.id,

      provider:
        refund.provider,
    };
  }

  if (
    !refund.providerRefundId
  ) {
    return {
      outcome:
        "MANUAL_REVIEW_REQUIRED" as const,

      reason:
        "Provider refund reference is missing. Automatic replay is intentionally blocked.",

      refundId:
        refund.id,

      provider:
        refund.provider,
    };
  }

  if (
    !adapter.queryRefund
  ) {
    return {
      outcome:
        "STATUS_QUERY_UNSUPPORTED" as const,

      refundId:
        refund.id,

      provider:
        refund.provider,
    };
  }

  const result =
    await adapter
      .queryRefund({
        refundId:
          refund.id,

        providerRefundId:
          refund.providerRefundId,

        amountRial:
          refund.amountRial,

        currency:
          refund.currency,
      });

  if (
    result.provider !==
      refund.provider ||
    result.providerRefundId !==
      refund.providerRefundId
  ) {
    return {
      outcome:
        "PROVIDER_RESULT_MISMATCH" as const,

      refundId:
        refund.id,

      provider:
        refund.provider,
    };
  }

  if (
    result.status ===
    "PROCESSING"
  ) {
    return {
      outcome:
        "PROCESSING" as const,

      refundId:
        refund.id,
    };
  }

  if (
    result.status ===
    "FAILED"
  ) {
    const now =
      new Date();

    await db
      .update(
        refunds,
      )
      .set({
        status:
          "FAILED",

        failedAt:
          now,

        updatedAt:
          now,
      })
      .where(
        eq(
          refunds.id,
          refund.id,
        ),
      );

    return {
      outcome:
        "FAILED" as const,

      idempotent:
        false,

      refundId:
        refund.id,
    };
  }

  const [linkedCase] = await db.select({ id: marketplaceRefundCases.id })
    .from(marketplaceRefundCases)
    .where(eq(marketplaceRefundCases.financialRefundId, refund.id)).limit(1);
  const finalized = linkedCase
    ? await finalizeSellerOrderRefund(refund.id)
    : await finalizeSuccessfulRefund(refund.id);

  return {
    outcome:
      "SUCCEEDED" as const,

    idempotent:
      finalized.idempotent,

    refundId:
      refund.id,
  };
}

export async function reconcilePendingRefunds(
  limit = 50,
) {
  const safeLimit =
    Math.max(
      1,
      Math.min(
        250,
        Math.trunc(
          limit,
        ),
      ),
    );

  const rows =
    await db
      .select({
        id:
          refunds.id,
      })
      .from(
        refunds,
      )
      .where(
        eq(
          refunds.status,
          "PENDING",
        ),
      )
      .limit(
        safeLimit,
      );

  const summary = {
    scanned:
      rows.length,

    succeeded:
      0,

    processing:
      0,

    failed:
      0,

    manualReview:
      0,

    missingAdapter:
      0,

    unsupported:
      0,

    other:
      0,
  };

  for (
    const row
    of rows
  ) {
    const result =
      await reconcileRefund(
        row.id,
      );

    switch (
      result.outcome
    ) {
      case "SUCCEEDED":
        summary.succeeded +=
          1;
        break;

      case "PROCESSING":
        summary.processing +=
          1;
        break;

      case "FAILED":
        summary.failed +=
          1;
        break;

      case "MANUAL_REVIEW_REQUIRED":
        summary.manualReview +=
          1;
        break;

      case "ADAPTER_MISSING":
        summary.missingAdapter +=
          1;
        break;

      case "STATUS_QUERY_UNSUPPORTED":
        summary.unsupported +=
          1;
        break;

      default:
        summary.other +=
          1;
        break;
    }
  }

  return summary;
}
