import {
  createHash,
} from "node:crypto";

import type {
  PaymentProvider,
} from "../contracts/payment-provider.js";

function stableId(
  prefix: string,
  value: string,
) {
  const digest =
    createHash(
      "sha256",
    )
      .update(
        value,
      )
      .digest(
        "hex",
      )
      .slice(
        0,
        24,
      );

  return `${prefix}_${digest}`;
}

export function createMockPaymentProvider(
  key = "mock",
): PaymentProvider {
  return {
    key,

    capabilities: {
      createPayment:
        true,
      verifyPayment:
        true,
      refund:
        false,
      partialRefund:
        false,
      webhook:
        true,
      statusQuery:
        true,
    },

    async createPayment(
      input,
    ) {
      const providerIntentId =
        stableId(
          key,
          [
            input.paymentIntentId,
            input.amountRial,
          ].join(
            ":",
          ),
        );

      return {
        provider:
          key,

        providerIntentId,

        redirectUrl:
          null,

        rawStatus:
          "CREATED",

        metadata: {
          deterministic:
            true,
        },
      };
    },

    async verifyPayment(
      input,
    ) {
      return {
        provider:
          key,

        status:
          "SUCCEEDED",

        providerReference:
          stableId(
            `${key}_ref`,
            input.providerIntentId,
          ),

        failureCode:
          null,

        metadata: {
          deterministic:
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
          `${key} is a development-only deterministic provider.`,
      };
    },
  };
}
