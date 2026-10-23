// Integration test support: a throwaway PostgreSQL database and Redis server,
// the migrations, and the real Fastify app driven in-process with app.inject.
// Nothing touches a developer's .env or data folder.
import { randomBytes } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import type { FastifyInstance, InjectOptions } from "fastify";

// @ts-expect-error Plain JavaScript helper shared with `npm run dev:stack`.
import { freePort, migrateDatabase, startPostgres, startRedis } from "../../dev/stack-lib.mjs";

export interface TestApi {
  app: FastifyInstance;
  request: (options: InjectOptions & { token?: string }) => Promise<{ status: number; body: any }>;
  register: (label?: string) => Promise<{ token: string; userId: string; email: string; password: string; address: string }>;
  /** Raw SQL for setup a route can't reach (fixed text only, never user input). */
  query: (text: string) => Promise<unknown>;
  stop: () => Promise<void>;
}

let counter = 0;

export async function startApi(): Promise<TestApi> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dnd-api-test-"));
  const pg = await startPostgres({ dir, port: await freePort(), database: "dnd_nerds_test" });
  const redis = await startRedis({ port: await freePort() });
  Object.assign(process.env, {
    NODE_ENV: "test",
    DATABASE_URL: pg.url,
    REDIS_URL: redis.url,
    EMAIL_PROVIDER: "development",
    PAYMENT_PROVIDER: "mock",
    PAYOUT_PROVIDER: "mock",
    MOCK_PAYMENT_WEBHOOK_SECRET: randomBytes(24).toString("hex"),
    MFA_ENCRYPTION_KEY: randomBytes(32).toString("hex"),
    PAYOUT_DESTINATION_ENCRYPTION_KEY: randomBytes(32).toString("base64"),
    NOTIFICATION_DESTINATION_KEY_HEX: randomBytes(32).toString("hex"),
  });
  await migrateDatabase(pg.url);

  // Imported only now: the config is read when these modules load.
  const { buildApp } = await import("../../src/app.js");
  const { sqlClient } = await import("../../src/db/client.js");
  const { getRedisClient } = await import("../../src/security/redis-rate-limit.js");
  const app = await buildApp();
  await app.ready();

  const request: TestApi["request"] = async ({ token, headers, ...options }) => {
    const response = await app.inject({
      ...options,
      headers: { ...(headers ?? {}), ...(token ? { authorization: `Bearer ${token}` } : {}) },
    });
    let body: unknown = null;
    try { body = response.json(); } catch { body = response.body; }
    return { status: response.statusCode, body };
  };

  const register: TestApi["register"] = async (label = "user") => {
    counter += 1;
    const email = `${label}.${counter}.${randomBytes(3).toString("hex")}@example.test`;
    const password = `Test-password-${randomBytes(6).toString("hex")}`;
    // Each test user gets its own client address, so the per-address rate limits stay out of the way.
    const address = `10.20.${Math.floor(counter / 250)}.${(counter % 250) + 1}`;
    const response = await request({ method: "POST", url: "/api/v1/auth/register", payload: { email, password }, remoteAddress: address });
    if (response.status !== 201) throw new Error(`register failed: ${response.status} ${JSON.stringify(response.body)}`);
    return { token: response.body.sessionToken, userId: response.body.user.id, email, password, address };
  };

  return {
    app,
    request,
    register,
    query: (text) => sqlClient.unsafe(text),
    stop: async () => {
      await app.close();
      await sqlClient.end({ timeout: 5 });
      await (await getRedisClient()).quit().catch(() => {});
      await redis.stop();
      await pg.stop();
      try {
        fs.rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 });
      } catch {
        // Windows can hold the stopped database's files for a moment; a leftover temp folder is harmless.
      }
    },
  };
}
