import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { hash } from "@node-rs/argon2";
import { eq, inArray } from "drizzle-orm";
import { buildApp } from "../dist/app.js";
import { issueSession } from "../dist/auth/session.js";
import { db } from "../dist/db/client.js";
import { marketplaceAdminAuditLogs, marketplaceAdmins, userSessions, users } from "../dist/db/schema.js";

const password = "Local-admin-smoke-password-123!";
const ids = [];
let app;
async function call(method, path, token, payload) {
  const result = await app.inject({ method, url: `/api/v1/admin/${path}`, headers: token ? { authorization: `Bearer ${token}` } : {}, payload });
  return { status: result.statusCode, body: result.json() };
}
try {
  const [superUser, ordinary] = await db.insert(users).values([
    { email: `admin-smoke-super-${randomUUID()}@example.invalid`, passwordHash: await hash(password), emailVerified: true },
    { email: `admin-smoke-user-${randomUUID()}@example.invalid`, emailVerified: true },
  ]).returning();
  ids.push(superUser.id, ordinary.id);
  await db.insert(marketplaceAdmins).values({ userId: superUser.id, role: "SUPER_ADMIN" });
  const adminToken = (await issueSession(superUser.id)).token;
  const userToken = (await issueSession(ordinary.id)).token;
  app = await buildApp();
  await app.ready();
  assert.equal((await call("GET", "accounts", null)).status, 403);
  assert.equal((await call("GET", "accounts", userToken)).status, 403);
  const listing = await call("GET", `accounts?q=${encodeURIComponent(ordinary.email)}`, adminToken);
  assert.equal(listing.status, 200);
  assert.equal(listing.body.data.length, 1);
  assert.equal(listing.body.data[0].email, ordinary.email);
  assert.equal("passwordHash" in listing.body.data[0], false);
  assert.equal((await call("GET", `accounts/${ordinary.id}`, adminToken)).body.data.activeSessions, 1);
  assert.equal((await call("PATCH", `accounts/${superUser.id}/status`, adminToken, { status: "SUSPENDED", password, reason: "Smoke test" })).status, 403);
  assert.equal((await call("PATCH", `accounts/${ordinary.id}/status`, adminToken, { status: "SUSPENDED", password: "wrong-password-123", reason: "Smoke test" })).status, 403);
  const suspend = await call("PATCH", `accounts/${ordinary.id}/status`, adminToken, { status: "SUSPENDED", password, reason: "Smoke test" });
  assert.equal(suspend.status, 200);
  const [session] = await db.select({ revokedAt: userSessions.revokedAt }).from(userSessions).where(eq(userSessions.userId, ordinary.id));
  assert.ok(session.revokedAt);
  assert.equal((await call("PATCH", `accounts/${ordinary.id}/role`, adminToken, { role: "SUPPORT", password, reason: "Smoke test" })).status, 409);
  assert.equal((await call("PATCH", `accounts/${ordinary.id}/status`, adminToken, { status: "ACTIVE", password, reason: "Smoke test" })).status, 200);
  assert.equal((await call("PATCH", `accounts/${ordinary.id}/role`, adminToken, { role: "SUPPORT", password, reason: "Smoke test" })).status, 200);
  assert.equal((await call("PATCH", `accounts/${ordinary.id}/role`, adminToken, { role: "NONE", password, reason: "Smoke test" })).status, 200);
  console.log("Admin accounts smoke test passed");
} finally {
  if (ids.length) {
    await db.delete(marketplaceAdminAuditLogs).where(inArray(marketplaceAdminAuditLogs.adminUserId, ids));
    await db.delete(users).where(inArray(users.id, ids));
  }
  if (app) await app.close();
}
