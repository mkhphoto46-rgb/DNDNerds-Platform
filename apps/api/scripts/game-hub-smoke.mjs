import { randomUUID } from "node:crypto";
import { eq, like, or } from "drizzle-orm";
import { buildApp } from "../dist/app.js";
import { issueSession } from "../dist/auth/session.js";
import { db } from "../dist/db/client.js";
import { users } from "../dist/db/schema.js";

const created = [];
let app;
let failure;
function expect(response, status, label) {
  if (response.statusCode !== status) throw new Error(`${label}: expected ${status}, got ${response.statusCode}: ${response.body}`);
  return response.json().data;
}
async function send(method, path, token, payload) {
  return app.inject({ method, url: `/api/v1/game-hub/${path}`, headers: token ? { authorization: `Bearer ${token}` } : {}, payload });
}
try {
  // Recover only accounts created by an interrupted earlier run of this smoke test.
  await db.delete(users).where(or(like(users.email, "qa-host-%@example.invalid"), like(users.email, "qa-player-%@example.invalid")));
  const [host, player] = await db.insert(users).values([
    { email: `qa-host-${randomUUID()}@example.invalid`, emailVerified: true },
    { email: `qa-player-${randomUUID()}@example.invalid`, emailVerified: true },
  ]).returning();
  created.push(host.id, player.id);
  const hostToken = (await issueSession(host.id)).token;
  const playerToken = (await issueSession(player.id)).token;
  app = await buildApp();
  await app.ready();
  expect(await send("GET", "tables"), 200, "public tables");
  expect(await send("GET", "tables/me"), 401, "private tables guard");
  expect(await send("GET", "admin/overview", playerToken), 403, "admin guard");
  expect(await send("PUT", "dms/me", hostToken, { displayName: "QA Dungeon Master", bio: "A smoke test profile", playStyle: "داستان‌محور", languages: "فارسی", experienceYears: 2, visible: true }), 200, "DM profile");
  const table = expect(await send("POST", "tables", hostToken, { title: "QA Campaign", description: "Temporary smoke test table", system: "D&D 5e", language: "فارسی", playStyle: "داستان‌محور", levelRange: "1-5", schedule: "Friday", capacity: 2, status: "PUBLISHED" }), 201, "create table");
  const application = expect(await send("POST", `tables/${table.id}/apply`, playerToken, { note: "I would like to join" }), 200, "apply to table");
  expect(await send("POST", `tables/${table.id}/apply`, hostToken, { note: "self" }), 409, "self apply guard");
  expect(await send("POST", `applications/${application.id}/respond`, hostToken, { accept: true }), 200, "accept application");
  const mine = expect(await send("GET", "tables/me", playerToken), 200, "player table state");
  if (mine.applications[0]?.status !== "ACCEPTED") throw new Error("Application did not become accepted");
  const listing = expect(await send("POST", "arena", hostToken, { mode: "1V1", title: "QA Challenge", note: "Temporary smoke test" }), 201, "create arena listing");
  expect(await send("POST", `arena/${listing.id}/join`, playerToken), 200, "join arena listing");
  expect(await send("POST", `arena/${listing.id}/join`, playerToken), 409, "duplicate join guard");
  console.log("Game hub smoke test passed");
} catch (error) {
  failure = error;
} finally {
  for (const userId of created) await db.delete(users).where(eq(users.id, userId));
}
if (failure) { console.error(failure); process.exit(1); }
process.exit(0);
