import { registerMarketplaceV21 } from "./routes/marketplace-v21.js";
import { registerTableDeletionRoutes } from "./routes/table-deletion.js";
import { registerObservability } from "./observability.js";
import { vttConfigWarnings } from "./integrations/vtt-origin.js";
import { assertProductionReady } from "./config/production-guards.js";
import { registerPayoutProviderRoutes } from "./routes/payout-provider.js";
import { registerSessionManagementRoutes } from "./routes/session-management.js";
import { registerAccountRoutes } from "./routes/account.js";
import { registerSocialRoutes } from "./routes/social.js";
import { registerSocialGroupRoutes } from "./routes/social-groups.js";
import { registerGameHubRoutes } from "./routes/game-hub.js";
import { registerProfilePagesRoutes } from "./routes/profile-pages.js";
import { registerXpRoutes } from "./routes/xp.js";
import { registerPayoutDestinationRoutes } from "./routes/payout-destinations.js";
import { registerRefundCaseRoutes } from "./routes/refund-cases.js";
import { registerPayoutRoutes } from "./routes/payouts.js";
import { registerSecurityRoutes } from "./routes/security.js";
import { registerHttpSecurity } from "./security/http-security.js";
import { registerAdminRoutes } from "./routes/admin.js";
import { registerSellerRoutes } from "./routes/seller.js";
import { registerSellerNotificationRoutes } from "./routes/seller-notifications.js";
import { registerSellerNotificationConnectionRoutes } from "./routes/seller-notification-connections.js";
import { registerPaymentRoutes } from "./routes/payments.js";
import { registerAuthRoutes } from "./routes/auth.js";
import { registerOrderRoutes } from "./routes/orders.js";
import {
  randomUUID,
} from "node:crypto";

import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import multipart from "@fastify/multipart";
import rateLimit from "@fastify/rate-limit";

import {
  sql,
} from "drizzle-orm";

import Fastify from "fastify";

import {
  config,
  parseTrustProxy,
} from "./config";

import {
  db,
  sqlClient,
} from "./db/client";

import {
  registerMarketplaceRoutes,
} from "./routes/marketplace";

function getErrorStatusCode(
  error:
    unknown,
): number | undefined {
  if (
    typeof error !== "object" ||
    error === null ||
    !("statusCode" in error)
  ) {
    return undefined;
  }

  const value =
    (
      error as {
        statusCode?: unknown;
      }
    ).statusCode;

  return (
    typeof value === "number"
      ? value
      : undefined
  );
}

// A route may attach a stable, upper-case code (e.g. SLUG_TAKEN) for the website to map to Persian text.
function getErrorApiCode(
  error:
    unknown,
): string | undefined {
  const value =
    typeof error === "object" && error !== null
      ? (error as { apiCode?: unknown }).apiCode
      : undefined;

  return typeof value === "string" && /^[A-Z][A-Z0-9_]{1,63}$/.test(value)
    ? value
    : undefined;
}

function getErrorMessage(
  error:
    unknown,
) {
  return (
    error instanceof Error
      ? error.message
      : "Unknown request error"
  );
}

export async function buildApp() {
  const app =
    Fastify({
      logger: {
        level:
          config.NODE_ENV ===
          "production"
            ? "info"
            : "debug",

        redact: [
          "req.headers.authorization",
          "req.headers.cookie",
          "req.headers.x-telegram-bot-api-secret-token",
        ],
      },

      genReqId:
        () =>
          randomUUID(),

      // C3: rate limits and session records need the visitor's address, not the proxy's.
      trustProxy:
        parseTrustProxy(
          config.API_TRUST_PROXY,
        ),

      bodyLimit:
        1024 * 1024,
    });

  await app.register(
    helmet,
    {
      contentSecurityPolicy:
        false,
    },
  );

  await app.register(
    cors,
    {
      origin:
        config.WEB_ORIGIN,

      credentials:
        true,
    },
  );

  await app.register(
    rateLimit,
    {
      max:
        config.API_RATE_LIMIT_MAX,

      timeWindow:
        "1 minute",
    },
  );

  await app.register(
    multipart,
    {
      limits: {
        files:
          1,

        fields:
          0,

        parts:
          1,

        fileSize:
          8 * 1024 * 1024,
      },
    },
  );

  app.get(
    "/health",

    async () => ({
      status:
        "ok",

      service:
        "dnd-nerds-api",
    }),
  );

  app.get(
    "/ready",

    async (
      _request,
      reply,
    ) => {
      try {
        await db.execute(
          sql`
            SELECT 1
          `,
        );

        return {
          status:
            "ready",

          service:
            "dnd-nerds-api",

          database:
            "ready",

          marketplace:
            "ready",

          uptimeSeconds:
            Math.floor(
              process.uptime(),
            ),
        };
      }
      catch {
        return reply
          .code(503)
          .send({
            status:
              "not-ready",

            database:
              "unavailable",
          });
      }
    },
  );

  await registerMarketplaceRoutes(
    app,
  );

  app.setNotFoundHandler(
    async (
      request,
      reply,
    ) =>
      reply
        .code(404)
        .send({
          error: {
            code:
              "ROUTE_NOT_FOUND",

            message:
              "Route not found",
          },

          requestId:
            request.id,
        }),
  );

  app.setErrorHandler(
    async (
      error,
      request,
      reply,
    ) => {
      request.log.error(
        {
          err:
            error,

          requestId:
            request.id,
        },

        "Unhandled API error",
      );

      const detected =
        getErrorStatusCode(
          error,
        );

      const statusCode =
        detected &&
        detected >= 400 &&
        detected < 600
          ? detected
          : 500;

      return reply
        .code(statusCode)
        .send({
          error: {
            code:
              statusCode === 500
                ? "INTERNAL_ERROR"
                : getErrorApiCode(error) ?? "REQUEST_ERROR",

            message:
              statusCode === 500
                ? "Internal server error"
                : getErrorMessage(
                    error,
                  ),
          },

          requestId:
            request.id,
        });
    },
  );

  app.addHook(
    "onClose",

    async () => {
      await sqlClient.end({
        timeout:
          5,
      });
    },
  );

  assertProductionReady();


  registerHttpSecurity(app);



  registerObservability(app);

  // B72: name the missing bridge variable at startup instead of failing quietly later.
  for (const warning of vttConfigWarnings()) app.log.warn(warning);


  await app.register(registerAuthRoutes);


  await app.register(registerSecurityRoutes);



  await app.register(registerAccountRoutes);
  await app.register(registerSocialRoutes);
  await app.register(registerSocialGroupRoutes);
  await app.register(registerGameHubRoutes);
  await app.register(registerTableDeletionRoutes);
  await app.register(registerProfilePagesRoutes);
  await app.register(registerXpRoutes);



  await app.register(registerSessionManagementRoutes);


  await app.register(registerAdminRoutes);
  await app.register(registerMarketplaceV21);

  if (process.env.FREE_LAUNCH_MODE !== "true" && config.NODE_ENV !== "production") {
    await app.register(registerOrderRoutes);
    await app.register(registerPaymentRoutes);
    await app.register(registerSellerRoutes);
    await app.register(registerSellerNotificationRoutes);
    await app.register(registerSellerNotificationConnectionRoutes);
    await app.register(registerRefundCaseRoutes);
    await app.register(registerPayoutDestinationRoutes);
    await app.register(registerPayoutRoutes);
    await app.register(registerPayoutProviderRoutes);
  }


  return app;
}
