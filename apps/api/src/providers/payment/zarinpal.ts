import type {
  PaymentProvider,
} from "../contracts/payment-provider.js";

import {
  buildZarinpalGatewayUrl,
  requestZarinpalPayment,
  verifyZarinpalPayment,
} from "../../integrations/zarinpal.js";

export const zarinpalPaymentProvider:
  PaymentProvider = {
  key:
    "zarinpal",

  capabilities: {
    createPayment:
      true,
    verifyPayment:
      true,
    refund:
      true,
    partialRefund:
      false,
    webhook:
      false,
    statusQuery:
      false,
  },

  async createPayment(
    input,
  ) {
    const result =
      await requestZarinpalPayment({
        amountRial:
          input.amountRial,

        callbackUrl:
          input.callbackUrl,

        description:
          input.description,

        email:
          input.customerEmail,

        mobile:
          input.customerMobile,
      });

    return {
      provider:
        "zarinpal",

      providerIntentId:
        result.authority,

      redirectUrl:
        result.gatewayUrl,

      rawStatus:
        "AUTHORITY_CREATED",

      metadata: {
        gatewayAmount:
          result.amount,
      },
    };
  },

  async verifyPayment(
    input,
  ) {
    const result =
      await verifyZarinpalPayment({
        amountRial:
          input.amountRial,

        authority:
          input.providerIntentId,
      });

    return {
      provider:
        "zarinpal",

      status:
        result.success
          ? "SUCCEEDED"
          : "FAILED",

      providerReference:
        result.refId ===
          null
          ? null
          : String(
              result.refId,
            ),

      failureCode:
        result.success
          ? null
          : String(
              result.code ??
              "UNKNOWN",
            ),

      metadata: {
        gatewayCode:
          result.code,

        cardPan:
          result.cardPan,

        cardHash:
          result.cardHash,

        gatewayAmount:
          result.amount,
      },
    };
  },

  redirectUrlForIntent(
    providerIntentId,
  ) {
    return buildZarinpalGatewayUrl(
      providerIntentId,
    );
  },

  async healthCheck() {
    const configured =
      Boolean(
        process.env
          .ZARINPAL_MERCHANT_ID,
      );

    return {
      configured,
      healthy:
        configured,
      message:
        configured
          ? "ZarinPal credentials are configured."
          : "ZARINPAL_MERCHANT_ID is missing.",
    };
  },
};
