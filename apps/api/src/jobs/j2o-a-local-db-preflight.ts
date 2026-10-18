import "dotenv/config";
import { sqlClient } from "../db/client.js";

async function main() {
  if (process.env.NODE_ENV === "production") throw new Error("J2O-A refuses production database");
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is missing");
  const url = new URL(databaseUrl);
  if (url.protocol !== "postgresql:" && url.protocol !== "postgres:") throw new Error("PostgreSQL URL required");
  if (!["127.0.0.1", "localhost"].includes(url.hostname)
      || url.port !== "54329" || url.pathname !== "/dnd_nerds") {
    throw new Error("J2O-A only permits the expected local development database (127.0.0.1:54329/dnd_nerds)");
  }
  // Drizzle journal version comes from the reviewed uploaded snapshot.
  const rows = await sqlClient<{ created_at: string }[]>`
    SELECT created_at::text AS created_at FROM drizzle.__drizzle_migrations ORDER BY id DESC LIMIT 1
  `;
  if (rows[0]?.created_at !== "1791499487440") {
    throw new Error("J2O-A database is not at the expected 0015 checkpoint. No migration may be applied.");
  }
  console.log("J2O-A LOCAL DATABASE PRECHECK PASS: checkpoint 0015; target 127.0.0.1:54329/dnd_nerds");
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "J2O-A database guard failed");
  process.exitCode = 1;
}).finally(async () => {
  await sqlClient.end({ timeout: 5 });
});
