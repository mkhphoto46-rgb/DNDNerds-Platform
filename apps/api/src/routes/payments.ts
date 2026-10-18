import {
  createHmac,
  timingSafeEqual,
} from "node:crypto";

import type {
  FastifyInstance,
} from "fastify";

import {
  z,
} from "zod";

import {
  requireAuthUser,
} from "../auth/session.js";

import {
  PaymentDomainError,
  getPaymentSummary,
  processProviderWebhook,
} from "../payments/payment-service.js";

import {
  createOrGetProviderPaymentIntent,
  paymentResultRedirectUrl,
  processProviderCallback,
} from "../providers/payment/checkout-service.js";

const createIntentBody =
  z.object({
    idempotencyKey:
      z.string()
        .min(12)
        .max(128)
        .regex(
          /^[A-Za-z0-9._:-]+$/,
        ),
  });

const orderParams =
  z.object({
    orderId:
      z.string()
        .uuid(),
  });

const callbackParams =
  z.object({
    provider:
      z.string()
        .min(2)
        .max(64)
        .regex(
          /^[a-z0-9-]+$/,
        ),

    intentId:
      z.string()
        .uuid(),
  });

const mockWebhookParams =
  z.object({
    provider:
      z.enum([
        "mock",
        "mock-secondary",
      ]),
  });

const mockWebhookBody =
  z.object({
    eventId:
      z.string()
        .min(8)
        .max(180),

    type:
      z.enum([
        "payment.succeeded",
        "payment.failed",
      ]),

    intentId:
      z.string()
        .uuid(),

    providerPaymentId:
      z.string()
        .min(8)
        .max(180)
        .optional(),

    errorCode:
      z.string()
        .max(100)
        .optional(),
  });

function canonicalJson(
  value: unknown,
) {
  return JSON.stringify(
    value,
  );
}

function secureEqualHex(
  left: string,
  right: string,
) {
  try {
    const leftBuffer =
      Buffer.from(
        left,
        "hex",
      );

    const rightBuffer =
      Buffer.from(
        right,
        "hex",
      );

    if (
      leftBuffer.length ===
        0 ||
      leftBuffer.length !==
        rightBuffer.length
    ) {
      return false;
    }

    return timingSafeEqual(
      leftBuffer,
      rightBuffer,
    );
  }
  catch {
    return false;
  }
}

function queryStrings(
  input: unknown,
) {
  if (
    typeof input !==
      "object" ||
    input ===
      null
  ) {
    return {};
  }

  const output:
    Record<
      string,
      string | undefined
    > = {};

  for (
    const [
      key,
      value,
    ]
    of Object.entries(
      input,
    )
  ) {
    if (
      typeof value ===
      "string"
    ) {
      output[key] =
        value;
    }
  }

  return output;
}

export async function registerPaymentRoutes(
  app: FastifyInstance,
) {
  app.post(
    "/api/v1/marketplace/orders/:orderId/payment-intent",
    async (
      request,
      reply,
    ) => {
      const user =
        await requireAuthUser(
          request,
        );

      if (!user) {
        return reply
          .code(401)
          .send({
            error: {
              code:
                "UNAUTHORIZED",

              message:
                "Authentication required.",
            },
          });
      }

      const params =
        orderParams.safeParse(
          request.params,
        );

      const body =
        createIntentBody.safeParse(
          request.body,
        );

      if (
        !params.success ||
        !body.success
      ) {
        return reply
          .code(400)
          .send({
            error: {
              code:
                "VALIDATION_ERROR",

              message:
                "Invalid payment-intent request.",
            },
          });
      }

      try {
        const result =
          await createOrGetProviderPaymentIntent(
            user.id,
            params.data.orderId,
            body.data.idempotencyKey,
          );

        return reply
          .code(
            result.idempotent
              ? 200
              : 201,
          )
          .send({
            ...result,

            source:
              "postgresql",
          });
      }
      catch (error) {
        if (
          error instanceof
          PaymentDomainError
        ) {
          return reply
            .code(
              error.statusCode,
            )
            .send({
              error: {
                code:
                  error.code,

                message:
                  error.message,

                details:
                  error.details,
              },
            });
        }

        throw error;
      }
    },
  );

  app.get(
    "/api/v1/marketplace/orders/:orderId/payment",
    async (
      request,
      reply,
    ) => {
      const user =
        await requireAuthUser(
          request,
        );

      if (!user) {
        return reply
          .code(401)
          .send({
            error: {
              code:
                "UNAUTHORIZED",

              message:
                "Authentication required.",
            },
          });
      }

      const params =
        orderParams.safeParse(
          request.params,
        );

      if (!params.success) {
        return reply
          .code(400)
          .send({
            error: {
              code:
                "VALIDATION_ERROR",

              message:
                "Invalid order id.",
            },
          });
      }

      const summary =
        await getPaymentSummary(
          user.id,
          params.data.orderId,
        );

      if (!summary) {
        return reply
          .code(404)
          .send({
            error: {
              code:
                "ORDER_NOT_FOUND",

              message:
                "Order was not found.",
            },
          });
      }

      return summary;
    },
  );

  app.get(
    "/api/v1/payments/callback/:provider/:intentId",
    async (
      request,
      reply,
    ) => {
      const params =
        callbackParams.safeParse(
          request.params,
        );

      if (!params.success) {
        return reply
          .code(400)
          .send({
            error: {
              code:
                "VALIDATION_ERROR",

              message:
                "Invalid payment callback.",
            },
          });
      }

      try {
        const result =
          await processProviderCallback(
            params.data.provider,
            params.data.intentId,
            queryStrings(
              request.query,
            ),
          );

        const redirectStatus =
          result.status ===
            "SUCCEEDED"
            ? "success"
            : result.status ===
                "PENDING"
              ? "pending"
              : "failed";

        return reply.redirect(
          paymentResultRedirectUrl(
            result.orderId,
            redirectStatus,
          ),
        );
      }
      catch (error) {
        if (
          error instanceof
          PaymentDomainError
        ) {
          return reply
            .code(
              error.statusCode,
            )
            .send({
              error: {
                code:
                  error.code,

                message:
                  error.message,

                details:
                  error.details,
              },
            });
        }

        throw error;
      }
    },
  );

  app.post(
    "/api/v1/payments/webhooks/:provider",
    async (
      request,
      reply,
    ) => {
      const params =
        mockWebhookParams.safeParse(
          request.params,
        );

      if (!params.success) {
        return reply
          .code(404)
          .send({
            error: {
              code:
                "PROVIDER_WEBHOOK_NOT_FOUND",

              message:
                "No signed development webhook handler exists for this provider.",
            },
          });
      }

      const secret =
        process.env
          .MOCK_PAYMENT_WEBHOOK_SECRET;

      if (
        !secret ||
        secret.length < 32
      ) {
        return reply
          .code(503)
          .send({
            error: {
              code:
                "MOCK_PROVIDER_NOT_CONFIGURED",

              message:
                "Mock provider webhook secret is not configured.",
            },
          });
      }

      const parsed =
        mockWebhookBody.safeParse(
          request.body,
        );

      if (!parsed.success) {
        return reply
          .code(400)
          .send({
            error: {
              code:
                "VALIDATION_ERROR",

              message:
                "Invalid webhook payload.",
            },
          });
      }

      const canonical =
        canonicalJson(
          parsed.data,
        );

      const expected =
        createHmac(
          "sha256",
          secret,
        )
          .update(
            canonical,
          )
          .digest(
            "hex",
          );

      const supplied =
        String(
          request.headers[
            "x-dnd-mock-signature"
          ] ??
          "",
        );

      if (
        !secureEqualHex(
          supplied,
          expected,
        )
      ) {
        return reply
          .code(401)
          .send({
            error: {
              code:
                "INVALID_WEBHOOK_SIGNATURE",

              message:
                "Webhook signature verification failed.",
            },
          });
      }

      try {
        const result =
          await processProviderWebhook(
            params.data.provider,
            parsed.data,
            canonical,
          );

        return reply
          .code(200)
          .send({
            ...result,

            source:
              "postgresql",
          });
      }
      catch (error) {
        if (
          error instanceof
          PaymentDomainError
        ) {
          return reply
            .code(
              error.statusCode,
            )
            .send({
              error: {
                code:
                  error.code,

                message:
                  error.message,

                details:
                  error.details,
              },
            });
        }

        throw error;
      }
    },
  );
}
