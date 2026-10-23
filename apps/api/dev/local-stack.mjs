// Starts PostgreSQL and a Redis-compatible server for local development, applies
// the migrations, and writes apps/api/.env from .env.example on first run (with
// freshly generated development keys). Stop with Ctrl+C.
//
//   npm run dev:stack            (from apps/api)
//
// Data stays in apps/api/.data (gitignored). Ports: PostgreSQL 54329 and Redis
// 6380, as in DEPLOYMENT_TOPOLOGY.md; override with DEV_POSTGRES_PORT and
// DEV_REDIS_PORT.
import { randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { migrateDatabase, startPostgres, startRedis } from "./stack-lib.mjs";

const apiRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dataDir = path.join(apiRoot, ".data");
fs.mkdirSync(dataDir, { recursive: true });

const pg = await startPostgres({ dir: dataDir, port: Number(process.env.DEV_POSTGRES_PORT ?? 54329), database: "dnd_nerds", persistent: true });
const redis = await startRedis({ port: Number(process.env.DEV_REDIS_PORT ?? 6380) });
await migrateDatabase(pg.url);

const envFile = path.join(apiRoot, ".env");
if (!fs.existsSync(envFile)) {
  const example = fs.readFileSync(path.join(apiRoot, ".env.example"), "utf8");
  const values = {
    DATABASE_URL: pg.url,
    REDIS_URL: redis.url,
    MFA_ENCRYPTION_KEY: randomBytes(32).toString("hex"),
    PAYOUT_DESTINATION_ENCRYPTION_KEY: randomBytes(32).toString("base64"),
    NOTIFICATION_DESTINATION_KEY_HEX: randomBytes(32).toString("hex"),
    MOCK_PAYMENT_WEBHOOK_SECRET: randomBytes(24).toString("hex"),
  };
  const filled = example.replace(/^([A-Z0-9_]+)=.*$/gm, (line, key) => (key in values ? `${key}=${values[key]}` : line));
  fs.writeFileSync(envFile, filled);
  console.log("Wrote apps/api/.env with development values.");
}

console.log(`PostgreSQL: ${pg.url.replace(/:[^:@/]+@/, ":***@")}`);
console.log(`Redis:      ${redis.url}`);
console.log("Ready. Run `npm run dev` here and `npm run dev:web` at the repository root. Ctrl+C stops.");

const shutdown = async () => {
  await redis.stop();
  await pg.stop();
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
setInterval(() => {}, 1 << 30);
