import "dotenv/config";
import { sqlClient } from "../db/client.js";
async function main() {
  if (process.env.NODE_ENV === "production") throw new Error("Production B1 migration prohibited");
  const url = new URL(process.env.DATABASE_URL ?? "");
  if (!["127.0.0.1", "localhost"].includes(url.hostname) || url.port !== "54329" || url.pathname !== "/dnd_nerds") {
    throw new Error("Expected LOCAL development database 127.0.0.1:54329/dnd_nerds");
  }
  const history = await sqlClient<{ total: string }[]>`SELECT count(*)::text AS total FROM drizzle.__drizzle_migrations`;
  const hasTwo = await sqlClient<{ table_name: string }[]>`
    SELECT table_name FROM information_schema.tables WHERE table_schema='public'
    AND table_name IN ('seller_notification_preferences','seller_notification_outbox')`;
  const future = await sqlClient<{ table_name: string }[]>`
    SELECT table_name FROM information_schema.tables WHERE table_schema='public'
    AND table_name IN ('seller_notification_connections','seller_notification_pairing_challenges')`;
  if (history[0]?.total !== "17" || hasTwo.length !== 2 || future.length !== 0) {
    throw new Error("J2O-B1 unexpected local DB checkpoint; STOP and inspect");
  }
  console.log("J2O-B1 LOCAL DB PREFLIGHT PASS: existing J2O-A tables, no B1 tables");
}
main().catch((e: unknown) => { console.error(e instanceof Error ? e.message : "Preflight failed"); process.exitCode = 1; })
  .finally(async () => { await sqlClient.end({ timeout: 5 }); });
