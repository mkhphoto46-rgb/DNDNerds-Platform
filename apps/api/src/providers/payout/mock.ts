import {
  createHash,
} from "node:crypto";

import type {
  PayoutProvider,
} from "../contracts/payout-provider.js";

export const genericMockPayoutProvider:
  PayoutProvider = {
  key:
    "mock",

  async createPayout(
    input,
  ) {
    const providerReference =
      "mock_payout_" +
      createHash(
        "sha256",
      )
        .update(
          input.idempotencyKey,
        )
        .digest(
          "hex",
        )
        .slice(
          0,
          24,
        );

    return {
      provider:
        "mock",

      providerReference,

      status:
        "SUCCEEDED",

      metadata: {
        deterministic:
          true,
      },
    };
  },


  async queryPayout(
    input,
  ) {
    const validReference =
      input.providerReference
        .startsWith(
          "mock_payout_",
        );

    return {
      provider:
        "mock",

      providerReference:
        input.providerReference,

      status:
        validReference
          ? "SUCCEEDED"
          : "FAILED",

      failureReason:
        validReference
          ? null
          : "Unknown mock payout reference.",

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
        "Mock payout provider is development-only.",
    };
  },
};
