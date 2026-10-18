import { sqlClient } from "../db/client.js";
import { processInAppNotificationBatch } from "../notifications/worker.js";

async function main() {
  const check = process.argv.includes("--check");
  const once = process.argv.includes("--once");
  const raw = Number(process.env.SELLER_NOTIFICATION_BATCH_LIMIT ?? "50");
  if (!Number.isInteger(raw) || raw < 1 || raw > 100) {
    throw new Error("SELLER_NOTIFICATION_BATCH_LIMIT must be 1..100");
  }
  if (check) {
    console.log("J2O-A IN_APP WORKER CONFIG PASS (external providers DISABLED)");
    return;
  }
  if (!once) {
    throw new Error("J2O-A worker only permits explicit --once; continuous scheduling belongs to a later phase");
  }
  if (process.env.DND_ENABLE_IN_APP_NOTIFICATION_WORKER !== "true") {
    throw new Error("DND_ENABLE_IN_APP_NOTIFICATION_WORKER=true is required for a real DB worker run");
  }
  const result = await processInAppNotificationBatch(raw);
  console.log(JSON.stringify({ job: "seller-notification-worker", ...result, externalProviders: "disabled" }));
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "notification worker failed");
  process.exitCode = 1;
}).finally(async () => {
  await sqlClient.end({ timeout: 5 });
});
