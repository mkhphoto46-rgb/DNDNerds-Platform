import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import postgres from "postgres";
import { freePort, migrateDatabase, startPostgres } from "./stack-lib.mjs";

const dir = mkdtempSync(join(tmpdir(), "dnd-profile-migration-"));
let pg;
try {
  pg = await startPostgres({ dir, port: await freePort(), database: "profile_test" });
  const client = postgres(pg.url);
  try { await client.unsafe("CREATE DATABASE profile_utf8 TEMPLATE template0 ENCODING 'UTF8'"); }
  finally { await client.end(); }
  await migrateDatabase(pg.url.replace("/profile_test", "/profile_utf8"));
  console.log("All migrations including profile pages passed");
} finally {
  if (pg) await pg.stop();
  rmSync(dir, { recursive: true, force: true });
}
