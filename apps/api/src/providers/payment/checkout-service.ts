import {
  createHash,
} from "node:crypto";

import {
  eq,
} from "drizzle-orm";

import {
  db,
} from "../../db/client.js";

import {
  paymentIntents,
} from "../../db/schema.js";

import {
  PaymentDomainError,
  createOrGetPaymentIntent,
  processProviderWebhook,
} from "../../payments/payment-service.js";

import {
  getPaymentProviderBinding,
} from "./binding-store.js";

import {
  getPaymentProvider,
} from "./registry.js";

import {
  createProviderPayment,
  verifyProviderPayment,
} from "./service.js";

function publicApiBase() {
  return (
    process.env
      .PUBLIC_API_URL ??
    "http://127.0.0.1:4100"
  ).replace(
    /\/+$/,
    "",
  );
}

function publicAppBase() {
  return (
    process.env
      .PUBLIC_APP_URL ??
    "http://localhost:3100"
  ).replace(
    /\/+$/,
    "",
  );
}

function callbackUrl(
  provider: string,
  paymentIntentId: string,
) {
  return (
    `${publicApiBase()}` +
    `/api/v1/payments/callback/${encodeURIComponent(
      provider,
    )}/${encodeURIComponent(
      paymentIntentId,
    )}`
  );
}

function callbackEventId(
  paymentIntentId: string,
  status: string,
) {
  const digest =
    createHash(
      "sha256",
    )
      .update(
        `${paymentIntentId}:${status}`,
      )
      .digest(
        "hex",
      )
      .slice(
        0,
        32,
      );

  return `callback:${digest}`;
}

export function paymentResultRedirectUrl(
  orderId: string,
  status:
    | "success"
    | "failed"
    | "pending",
) {
  return (
    `${publicAppBase()}` +
    `/payment/result?orderId=${encodeURIComponent(
      orderId,
    )}&status=${encodeURIComponent(
      status,
    )}`
  );
}

export async function createOrGetProviderPaymentIntent(
  userId: string,
  orderId: string,
  idempotencyKey: string,
) {
  const requestedProvider =
    getPaymentProvider();

  const base =
    await createOrGetPaymentIntent(
      userId,
      orderId,
      idempotencyKey,
      requestedProvider.key,
    );

  const existingBinding =
    await getPaymentProviderBinding(
      base.intent.id,
    );

  const selectedProvider =
    getPaymentProvider(
      existingBinding
        ?.providerKey ??
        base.intent.provider,
    );

  let providerSession:
    Awaited<
      ReturnType<
        typeof createProviderPayment
      >
    >;

  try {
    providerSession =
      await createProviderPayment({
        paymentIntentId:
          base.intent.id,

        amountRial:
          base.intent.amountRial,

        callbackUrl:
          callbackUrl(
            selectedProvider.key,
            base.intent.id,
          ),

        description:
          `DND Nerds order ${orderId}`,

        providerKey:
          selectedProvider.key,
      });
  }
  catch (error) {
    if (
      error instanceof Error &&
      error.message.includes(
        "already being created",
      )
    ) {
      throw new PaymentDomainError(
        409,
        "PAYMENT_PROVIDER_SESSION_BUSY",
        "Payment provider session is being created by another request. Retry shortly.",
      );
    }

    throw error;
  }

  const [
    updatedIntent,
  ] =
    await db
      .update(
        paymentIntents,
      )
      .set({
        provider:
          providerSession.provider,

        providerIntentId:
          providerSession
            .providerIntentId,

        status:
          base.intent.status ===
            "SUCCEEDED"
            ? "SUCCEEDED"
            : "REQUIRES_PAYMENT",

        lastErrorCode:
          null,

        failedAt:
          null,

        updatedAt:
          new Date(),
      })
      .where(
        eq(
          paymentIntents.id,
          base.intent.id,
        ),
      )
      .returning();

  if (!updatedIntent) {
    throw new Error(
      "Payment intent provider synchronization failed.",
    );
  }

  return {
    intent:
      updatedIntent,

    providerSession: {
      provider:
        providerSession.provider,

      providerIntentId:
        providerSession
          .providerIntentId,

      redirectUrl:
        providerSession
          .redirectUrl,

      reused:
        providerSession.reused,
    },

    idempotent:
      base.idempotent,
  };
}

export async function processProviderCallback(
  providerKey: string,
  paymentIntentId: string,
  query:
    Record<
      string,
      string | undefined
    >,
) {
  const [
    intent,
  ] =
    await db
      .select()
      .from(
        paymentIntents,
      )
      .where(
        eq(
          paymentIntents.id,
          paymentIntentId,
        ),
      )
      .limit(
        1,
      );

  if (!intent) {
    throw new PaymentDomainError(
      404,
      "PAYMENT_INTENT_NOT_FOUND",
      "Payment intent was not found.",
    );
  }

  const binding =
    await getPaymentProviderBinding(
      intent.id,
    );

  if (!binding) {
    throw new PaymentDomainError(
      409,
      "PAYMENT_PROVIDER_BINDING_MISSING",
      "Payment provider binding is missing.",
    );
  }

  if (
    binding.providerKey !==
      providerKey ||
    intent.provider !==
      providerKey
  ) {
    throw new PaymentDomainError(
      409,
      "PAYMENT_PROVIDER_MISMATCH",
      "Callback provider does not match the provider pinned to this payment intent.",
      {
        intentProvider:
          intent.provider,

        bindingProvider:
          binding.providerKey,

        callbackProvider:
          providerKey,
      },
    );
  }

  const callbackAuthority =
    query.Authority ??
    query.authority;

  if (
    callbackAuthority &&
    binding.providerIntentId &&
    callbackAuthority !==
      binding.providerIntentId
  ) {
    throw new PaymentDomainError(
      409,
      "PAYMENT_PROVIDER_INTENT_MISMATCH",
      "Callback provider intent id does not match the pinned payment intent.",
    );
  }

  const verified =
    await verifyProviderPayment({
      paymentIntentId:
        intent.id,

      amountRial:
        intent.amountRial,

      query,
    });

  if (
    verified.status ===
    "PENDING"
  ) {
    return {
      status:
        "PENDING" as const,

      orderId:
        intent.orderId,

      paymentIntentId:
        intent.id,

      provider:
        providerKey,

      providerReference:
        verified.providerReference,

      idempotent:
        false,
    };
  }

  if (
    verified.status ===
      "SUCCEEDED" &&
    !verified.providerReference
  ) {
    throw new PaymentDomainError(
      502,
      "PROVIDER_REFERENCE_MISSING",
      "Payment provider reported success without a provider reference.",
    );
  }

  const normalized = {
    provider:
      providerKey,

    paymentIntentId:
      intent.id,

    providerIntentId:
      binding.providerIntentId,

    providerReference:
      verified.providerReference,

    status:
      verified.status,

    failureCode:
      verified.failureCode,
  };

  const canonicalPayload =
    JSON.stringify(
      normalized,
    );

  const result =
    await processProviderWebhook(
      providerKey,
      {
        eventId:
          callbackEventId(
            intent.id,
            verified.status,
          ),

        type:
          verified.status ===
            "SUCCEEDED"
            ? "payment.succeeded"
            : "payment.failed",

        intentId:
          intent.id,

        providerPaymentId:
          verified.providerReference ??
          undefined,

        errorCode:
          verified.failureCode ??
          undefined,
      },
      canonicalPayload,
    );

  return {
    ...result,

    orderId:
      result.orderId ??
      intent.orderId,

    provider:
      providerKey,

    providerReference:
      verified.providerReference,

    paymentIntentId:
      intent.id,
  };
}
