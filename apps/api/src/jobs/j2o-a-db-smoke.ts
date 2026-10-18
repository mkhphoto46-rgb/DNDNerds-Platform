import "dotenv/config";
import { sqlClient } from "../db/client.js";

async function main() {
  if (process.env.NODE_ENV === "production") throw new Error("Production DB smoke test is prohibited");
  const url = new URL(process.env.DATABASE_URL ?? "");
  if (!["127.0.0.1", "localhost"].includes(url.hostname)
      || url.port !== "54329" || url.pathname !== "/dnd_nerds") {
    throw new Error("Unexpected database target for J2O-A smoke test");
  }
  const rows = await sqlClient<{ table_name: string }[]>`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name IN
      ('seller_notification_preferences', 'seller_notification_outbox')
  `;
  if (rows.length !== 2) throw new Error("Missing notification tables");
  const indexes = await sqlClient<{ indexname: string }[]>`
    SELECT indexname FROM pg_indexes WHERE schemaname = 'public' AND indexname IN
      ('seller_notification_preferences_unique', 'seller_notification_outbox_dedupe_unique')
  `;
  if (indexes.length !== 2) throw new Error("Missing notification unique constraints");
  console.log("J2O-A LOCAL DB SCHEMA SMOKE PASS: 2 tables + 2 unique indexes");
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "DB smoke failed");
  process.exitCode = 1;
}).finally(async () => {
  await sqlClient.end({ timeout: 5 });
});
