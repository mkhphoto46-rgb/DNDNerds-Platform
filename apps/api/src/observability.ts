import type {
  FastifyInstance,
  FastifyRequest,
} from "fastify";

import {
  sql,
} from "drizzle-orm";

import {
  collectDefaultMetrics,
  Gauge,
  Histogram,
  Registry,
} from "prom-client";

import {
  db,
} from "./db/client.js";

import {
  getRedisClient,
} from "./security/redis-rate-limit.js";

const registry =
  new Registry();

collectDefaultMetrics({
  register:
    registry,

  prefix:
    "dndnerds_",
});

const duration =
  new Histogram({
    name:
      "dndnerds_http_request_duration_seconds",

    help:
      "HTTP request duration in seconds.",

    labelNames: [
      "method",
      "route",
      "status",
    ] as const,

    buckets: [
      0.01,
      0.025,
      0.05,
      0.1,
      0.25,
      0.5,
      1,
      2.5,
      5,
    ],

    registers: [
      registry,
    ],
  });

const active =
  new Gauge({
    name:
      "dndnerds_http_active_requests",

    help:
      "Current in-flight HTTP requests.",

    registers: [
      registry,
    ],
  });

const starts =
  new WeakMap<
    FastifyRequest,
    bigint
  >();

const noRateLimit = {
  config: {
    rateLimit:
      false,
  },
} as const;

export function registerObservability(
  app: FastifyInstance,
) {
  app.addHook(
    "onRequest",
    async (
      request,
    ) => {
      active.inc();

      starts.set(
        request,
        process.hrtime.bigint(),
      );
    },
  );

  app.addHook(
    "onResponse",
    async (
      request,
      reply,
    ) => {
      active.dec();

      const started =
        starts.get(
          request,
        );

      if (!started) {
        return;
      }

      const elapsed =
        Number(
          process.hrtime.bigint() -
          started,
        ) /
        1_000_000_000;

      duration.observe(
        {
          method:
            request.method,

          route:
            request.routeOptions
              .url ??
            "unknown",

          status:
            String(
              reply.statusCode,
            ),
        },
        elapsed,
      );
    },
  );

  app.get(
    "/health/live",
    noRateLimit,
    async () => {
      return {
        status:
          "live",

        service:
          "dnd-nerds-api",
      };
    },
  );

  app.get(
    "/health/ready",
    noRateLimit,
    async (
      _request,
      reply,
    ) => {
      try {
        await db.execute(
          sql`select 1`,
        );

        const redis =
          await getRedisClient();

        const pong =
          await redis.ping();

        if (
          pong !==
          "PONG"
        ) {
          throw new Error(
            "Redis ping failed.",
          );
        }

        return {
          status:
            "ready",

          postgres:
            "ready",

          redis:
            "ready",
        };
      }
      catch (
        error
      ) {
        reply.code(
          503,
        );

        return {
          status:
            "not-ready",

          error:
            error instanceof Error
              ? error.message
              : "Unknown readiness error",
        };
      }
    },
  );

  app.get(
    "/metrics",
    noRateLimit,
    async (
      _request,
      reply,
    ) => {
      reply.type(
        registry.contentType,
      );

      return registry.metrics();
    },
  );
}
