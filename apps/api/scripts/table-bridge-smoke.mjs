import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { eq, like } from "drizzle-orm";
import { buildApp } from "../dist/app.js";
import { issueSession } from "../dist/auth/session.js";
import { db } from "../dist/db/client.js";
import { users } from "../dist/db/schema.js";
import { verifyVttTicket } from "../dist/routes/vtt-ticket.js";

const secret = "test-secret-for-local-bridge-check-only-123456";
process.env.VTT_BRIDGE_SECRET = secret;
process.env.VTT_PUBLIC_URL = "http://localhost:4200/";
const created = [];
let app;
async function send(method, path, token, payload) {
  const response = await app.inject({ method, url: `/api/v1/game-hub/${path}`, headers: token ? { authorization: `Bearer ${token}` } : {}, payload });
  return { status: response.statusCode, body: response.json() };
}
try {
  await db.delete(users).where(like(users.email, "bridge-%@example.invalid"));
  const accounts = await db.insert(users).values(["host", "player", "outsider"].map(kind => ({ email: `bridge-${kind}-${randomUUID()}@example.invalid`, emailVerified: true }))).returning();
  created.push(...accounts.map(account => account.id));
  const [host, player, outsider] = await Promise.all(accounts.map(async account => (await issueSession(account.id)).token));
  app = await buildApp();
  await app.ready();
  const fields = { title: "Private bridge check", description: "", system: "D&D 5e", language: "فارسی", playStyle: "داستان‌محور", levelRange: "1-5", schedule: "Friday", capacity: 2, status: "PUBLISHED", visibility: "PRIVATE" };
  assert.equal((await send("POST", "tables", null, fields)).status, 401);
  const createdTable = await send("POST", "tables", host, fields);
  assert.equal(createdTable.status, 201);
  const { id, inviteCode } = createdTable.body.data;
  assert.ok(inviteCode);
  assert.equal((await send("POST", `tables/${id}/launch`, null, { role: "player" })).status, 401);
  assert.equal((await send("POST", "tables/join-by-code", null, { code: inviteCode })).status, 401);
  assert.equal((await send("GET", "tables", null)).body.data.some(table => table.id === id), false);
  assert.equal((await send("POST", `tables/${id}/launch`, player, { role: "player" })).status, 403);
  assert.equal((await send("POST", `tables/${id}/launch`, player, { role: "dm" })).status, 403);
  const hostLaunch = await send("POST", `tables/${id}/launch`, host, { role: "dm" });
  assert.equal(hostLaunch.status, 200);
  const hostTicket = new URL(hostLaunch.body.data.url).searchParams.get("ticket");
  assert.equal(verifyVttTicket(hostTicket, secret)?.role, "dm");
  assert.equal((await send("POST", "tables/join-by-code", player, { code: "WRONGCODE" })).status, 404);
  assert.equal((await send("POST", "tables/join-by-code", player, { code: inviteCode })).status, 200);
  const playerLaunch = await send("POST", `tables/${id}/launch`, player, { role: "player" });
  assert.equal(playerLaunch.status, 200);
  assert.equal(verifyVttTicket(new URL(playerLaunch.body.data.url).searchParams.get("ticket"), secret)?.role, "player");
  const rotated = await send("POST", `tables/${id}/invite/rotate`, host);
  assert.equal(rotated.status, 200);
  assert.notEqual(rotated.body.data.inviteCode, inviteCode);
  assert.equal((await send("POST", "tables/join-by-code", outsider, { code: inviteCode })).status, 404);
  assert.equal((await send("POST", "tables/join-by-code", outsider, { code: rotated.body.data.inviteCode })).status, 200);
  console.log("Private table bridge smoke test passed");
} finally {
  for (const userId of created) await db.delete(users).where(eq(users.id, userId));
  if (app) await app.close();
}
