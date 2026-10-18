import {
  createHash,
} from "node:crypto";

import type {
  RefundProvider,
} from "../contracts/refund-provider.js";

export function createMockRefundProvider(
  key: string,
): RefundProvider {
  const normalizedKey =
    key
      .trim()
      .toLowerCase();

  if (!normalizedKey) {
    throw new Error(
      "Mock refund provider key cannot be empty.",
    );
  }

  return {
    capabilities: { partialRefund: true },
    key:
      normalizedKey,

    async createRefund(
      input,
    ) {
      const providerRefundId =
        `${normalizedKey}_refund_` +
        createHash(
          "sha256",
        )
          .update(
            [
              input.refundId,
              input.paymentId,
              input.idempotencyKey,
            ].join(":"),
            "utf8",
          )
          .digest(
            "hex",
          )
          .slice(
            0,
            28,
          );

      return {
        provider:
          normalizedKey,

        providerRefundId,

        status:
          "SUCCEEDED",

        failureCode:
          null,

        metadata: {
          deterministic:
            true,
        },
      };
    },

    async queryRefund(
      input,
    ) {
      return {
        provider:
          normalizedKey,

        providerRefundId:
          input.providerRefundId,

        status:
          "SUCCEEDED",

        failureCode:
          null,

        metadata: {
          deterministic:
            true,

          queried:
            true,
        },
      };
    },

    async healthCheck() {
      return {
        configured:
          true,

        healthy:
          true,

        message:
          "Mock refund provider is development-only.",
      };
    },
  };
}
