import type {
  FastifyInstance,
} from "fastify";

import {
  createHash,
} from "node:crypto";

import {
  consumeRateLimit,
} from "./redis-rate-limit.js";

function normalizedPath(
  url: string,
) {
  return (
    url.split("?")[0] ??
    url
  );
}

function limitFor(
  method: string,
  path: string,
) {
  if (
    path ===
    "/api/v1/auth/login"
  ) {
    return {
      max:
        8,

      windowMs:
        60_000,

      scope:
        "auth-login",
    };
  }

  if (
    path ===
    "/api/v1/auth/register"
  ) {
    return {
      max:
        5,

      windowMs:
        60_000,

      scope:
        "auth-register",
    };
  }

  if (
    path.includes(
      "/password-reset/request",
    ) ||
    path.includes(
      "/email-verification/request",
    )
  ) {
    return {
      max:
        5,

      windowMs:
        10 * 60_000,

      scope:
        "account-recovery",
    };
  }

  if (
    path.startsWith(
      "/api/v1/payments/webhooks/",
    ) ||
    path.startsWith(
      "/api/v1/payments/callback/",
    )
  ) {
    return {
      max:
        60,

      windowMs:
        60_000,

      scope:
        "payment-webhook",
    };
  }

  if (
    ![
      "GET",
      "HEAD",
      "OPTIONS",
    ].includes(method)
  ) {
    return {
      max:
        180,

      windowMs:
        60_000,

      scope:
        "mutation",
    };
  }

  return null;
}

function keyPart(
  value: string,
) {
  return createHash(
    "sha256",
  )
    .update(
      value,
      "utf8",
    )
    .digest(
      "hex",
    )
    .slice(
      0,
      24,
    );
}

export function registerHttpSecurity(
  app: FastifyInstance,
) {
  app.addHook(
    "onRequest",
    async (
      request,
      reply,
    ) => {
      const method =
        request.method
          .toUpperCase();

      const path =
        normalizedPath(
          request.url,
        );

      const limit =
        limitFor(
          method,
          path,
        );

      if (!limit) {
        return;
      }

      const key =
        [
          "dndnerds",
          "rl",
          limit.scope,
          keyPart(
            request.ip,
          ),
          keyPart(
            path,
          ),
        ].join(":");

      try {
        const result =
          await consumeRateLimit(
            key,
            limit.max,
            limit.windowMs,
          );

        reply.header(
          "X-RateLimit-Limit",
          String(
            limit.max,
          ),
        );

        reply.header(
          "X-RateLimit-Remaining",
          String(
            result.remaining,
          ),
        );

        if (
          result.limited
        ) {
          reply.header(
            "Retry-After",
            String(
              result.retryAfterSeconds,
            ),
          );

          return reply
            .code(429)
            .send({
              error: {
                code:
                  "RATE_LIMITED",

                message:
                  "Too many requests. Try again later.",
              },
            });
        }
      }
      catch (
        error
      ) {
        request.log.error(
          {
            error,
          },
          "Redis rate limiter unavailable.",
        );

        return reply
          .code(503)
          .send({
            error: {
              code:
                "RATE_LIMIT_BACKEND_UNAVAILABLE",

              message:
                "Security rate-limit backend is temporarily unavailable.",
            },
          });
      }
    },
  );

  app.addHook(
    "onSend",
    async (
      _request,
      reply,
      payload,
    ) => {
      reply.header(
        "X-Content-Type-Options",
        "nosniff",
      );

      reply.header(
        "X-Frame-Options",
        "DENY",
      );

      reply.header(
        "Referrer-Policy",
        "no-referrer",
      );

      reply.header(
        "Permissions-Policy",
        "camera=(), microphone=(), geolocation=()",
      );

      reply.header(
        "Cross-Origin-Opener-Policy",
        "same-origin",
      );

      reply.header(
        "Cache-Control",
        "no-store",
      );

      return payload;
    },
  );
}
