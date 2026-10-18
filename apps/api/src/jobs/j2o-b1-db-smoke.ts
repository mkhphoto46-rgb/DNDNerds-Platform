import "dotenv/config";
import { sqlClient } from "../db/client.js";
async function main() {
  if (process.env.NODE_ENV === "production") throw new Error("Production smoke prohibited");
  const url = new URL(process.env.DATABASE_URL ?? "");
  if (!["127.0.0.1", "localhost"].includes(url.hostname) || url.port !== "54329" || url.pathname !== "/dnd_nerds") throw new Error("Wrong DB");
  const tables = await sqlClient<{ table_name: string }[]>`
    SELECT table_name FROM information_schema.tables WHERE table_schema='public'
    AND table_name IN ('seller_notification_connections','seller_notification_pairing_challenges')`;
  const indexes = await sqlClient<{ indexname: string }[]>`
    SELECT indexname FROM pg_indexes WHERE schemaname='public'
    AND indexname IN ('seller_notification_connections_unique','seller_notification_pairing_token_unique')`;
  if (tables.length !== 2 || indexes.length !== 2) throw new Error("J2O-B1 schema/index verification failed");
  console.log("J2O-B1 LOCAL DATABASE SCHEMA PASS: 2 new tables + 2 unique indexes");
}
main().catch((e: unknown) => { console.error(e instanceof Error ? e.message : "Smoke failed"); process.exitCode = 1; })
  .finally(async () => { await sqlClient.end({ timeout: 5 }); });
