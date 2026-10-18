import {
  RefundProviderUncertainError,
} from "../contracts/refund-provider.js";

import type {
  RefundProvider,
} from "../contracts/refund-provider.js";

import {
  ZarinpalRefundOutcomeUncertainError,
  createZarinpalRefund,
  queryZarinpalRefund,
  resolveZarinpalRefundSession,
  zarinpalRefundHealth,
} from "../../integrations/zarinpal-refunds.js";

export const zarinpalRefundProvider:
  RefundProvider = {
  key:
    "zarinpal",
  capabilities: { partialRefund: false },

  async createRefund(
    input,
  ) {
    if (
      input.currency
        .trim()
        .toUpperCase() !==
      "IRR"
    ) {
      throw new Error(
        "ZarinPal refund adapter currently requires IRR.",
      );
    }

    if (
      !input.providerIntentId
        ?.trim()
    ) {
      throw new Error(
        "ZARINPAL_REFUND_AUTHORITY_MISSING",
      );
    }

    const providerReference =
      input.providerReference
        ?.trim();

    if (
      !providerReference ||
      providerReference !==
        input.providerPaymentId
    ) {
      throw new Error(
        "ZARINPAL_REFUND_REFERENCE_MISMATCH",
      );
    }

    const session =
      await resolveZarinpalRefundSession({
        orderId:
          input.orderId,

        amountRial:
          input.amountRial,
      });

    try {
      const result =
        await createZarinpalRefund({
          sessionId:
            session.sessionId,

          amountRial:
            input.amountRial,

          description:
            `DND Nerds refund ${input.refundId}: ${input.reason}`,
        });

      return {
        provider:
          "zarinpal",

        providerRefundId:
          result.providerRefundId,

        status:
          result.status,

        failureCode:
          result.failureCode,

        metadata: {
          providerStatus:
            result.providerStatus,

          providerAmount:
            result.providerAmount,

          sessionResolved:
            true,
        },
      };
    }
    catch (error) {
      if (
        error instanceof
          ZarinpalRefundOutcomeUncertainError
      ) {
        throw new RefundProviderUncertainError(
          error.code,
          error.message,
        );
      }

      throw error;
    }
  },

  async queryRefund(
    input,
  ) {
    try {
      const result =
        await queryZarinpalRefund({
          providerRefundId:
            input.providerRefundId,

          amountRial:
            input.amountRial,
        });

      return {
        provider:
          "zarinpal",

        providerRefundId:
          result.providerRefundId,

        status:
          result.status,

        failureCode:
          result.failureCode,

        metadata: {
          providerStatus:
            result.providerStatus,

          providerAmount:
            result.providerAmount,
        },
      };
    }
    catch (error) {
      return {
        provider:
          "zarinpal",

        providerRefundId:
          input.providerRefundId,

        status:
          "PROCESSING",

        failureCode:
          error instanceof Error
            ? error.message
                .slice(
                  0,
                  120,
                )
            : "ZARINPAL_REFUND_QUERY_UNAVAILABLE",

        metadata: {
          queryRetryable:
            true,
        },
      };
    }
  },

  async healthCheck() {
    return zarinpalRefundHealth();
  },
};
