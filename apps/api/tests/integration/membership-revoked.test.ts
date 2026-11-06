// RC7: when a player's right to a table ends on the website, the table app is told
// through the signed bridge. A local HTTP server stands in for the table app.
import assert from "node:assert/strict";
import { createHmac, randomBytes } from "node:crypto";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, test } from "node:test";

import { startApi, type TestApi } from "../support/api.js";

type Call = { path: string; body: string; timestamp: string; signature: string };
const secret = randomBytes(32).toString("hex");
const calls: Call[] = [];
let receiver: http.Server;
let api: TestApi;

before(async () => {
  receiver = http.createServer((req, res) => {
    let body = "";
    req.on("data", chunk => { body += chunk; });
    req.on("end", () => {
      calls.push({ path: req.url ?? "", body, timestamp: String(req.headers["x-platform-timestamp"]), signature: String(req.headers["x-platform-signature"]) });
      res.writeHead(200, { "content-type": "application/json" }).end("{}");
    });
  });
  await new Promise<void>(resolve => receiver.listen(0, "127.0.0.1", resolve));
  process.env.VTT_INTERNAL_URL = `http://127.0.0.1:${(receiver.address() as AddressInfo).port}`;
  process.env.VTT_BRIDGE_SECRET = secret;
  api = await startApi(); api.app.log.level = "silent";
});
after(async () => {
  await api?.stop();
  await new Promise(resolve => receiver.close(resolve));
  delete process.env.VTT_INTERNAL_URL; delete process.env.VTT_BRIDGE_SECRET;
});

const tableInput = { title: "RC7 table", description: "", system: "D&D 5e", language: "فارسی", playStyle: "داستانی", levelRange: "1-5", schedule: "Friday", capacity: 4, status: "PUBLISHED", visibility: "PUBLIC" };

async function revocation(match: (body: { platformTableId: string | null; platformUserId: string; reason: string }) => boolean) {
  for (let waited = 0; waited < 3000; waited += 50) {
    const found = calls.find(call => call.path === "/api/platform/membership-revoked" && match(JSON.parse(call.body)));
    if (found) return found;
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  return undefined;
}

async function seatedTable(label: string) {
  const dm = await api.register(`${label}dm`);
  const player = await api.register(`${label}p`);
  const table = await api.request({ method: "POST", url: "/api/v1/game-hub/tables", token: dm.token, payload: { ...tableInput, title: `RC7 ${label}` } });
  assert.equal(table.status, 201, JSON.stringify(table.body));
  const applied = await api.request({ method: "POST", url: `/api/v1/game-hub/tables/${table.body.data.id}/apply`, token: player.token, payload: { note: "" } });
  const accepted = await api.request({ method: "POST", url: `/api/v1/game-hub/applications/${applied.body.data.id}/respond`, token: dm.token, payload: { accept: true } });
  assert.equal(accepted.status, 200, JSON.stringify(accepted.body));
  return { dm, player, tableId: table.body.data.id as string, applicationId: applied.body.data.id as string };
}

async function admin() {
  const user = await api.register("rc7admin");
  await api.query(`insert into marketplace_admins (user_id, role) values ('${user.userId}', 'SUPER_ADMIN')`);
  return user;
}

test("RC7: withdrawing an accepted seat is signed and sent to the table app", async () => {
  const { player, tableId, applicationId } = await seatedTable("withdraw");
  const withdrawn = await api.request({ method: "POST", url: `/api/v1/game-hub/applications/${applicationId}/withdraw`, token: player.token });
  assert.equal(withdrawn.status, 200, JSON.stringify(withdrawn.body));
  const call = await revocation(body => body.platformUserId === player.userId);
  assert.ok(call, "the table app was called");
  assert.equal(call.body, JSON.stringify({ platformTableId: tableId, platformUserId: player.userId, reason: "seat-withdrawn" }));
  assert.match(call.timestamp, /^\d{13}$/);
  assert.equal(call.signature, createHmac("sha256", secret).update(`${call.timestamp}:${call.body}`).digest("hex"));
});

test("RC7: withdrawing a pending application sends nothing", async () => {
  const dm = await api.register("pendingdm");
  const player = await api.register("pendingp");
  const table = await api.request({ method: "POST", url: "/api/v1/game-hub/tables", token: dm.token, payload: tableInput });
  const applied = await api.request({ method: "POST", url: `/api/v1/game-hub/tables/${table.body.data.id}/apply`, token: player.token, payload: { note: "" } });
  await api.request({ method: "POST", url: `/api/v1/game-hub/applications/${applied.body.data.id}/withdraw`, token: player.token });
  assert.equal(await revocation(body => body.platformUserId === player.userId), undefined);
});

test("RC7: closing a table revokes each seated player", async () => {
  const { dm, player, tableId } = await seatedTable("close");
  const closed = await api.request({ method: "PUT", url: `/api/v1/game-hub/tables/${tableId}`, token: dm.token, payload: { ...tableInput, title: "RC7 close", status: "CLOSED" } });
  assert.equal(closed.status, 200, JSON.stringify(closed.body));
  assert.ok(await revocation(body => body.platformUserId === player.userId && body.platformTableId === tableId && body.reason === "table-closed"));
});

test("RC7: an admin hiding a table revokes its players", async () => {
  const { player, tableId } = await seatedTable("hide");
  const moderator = await admin();
  const hidden = await api.request({ method: "POST", url: `/api/v1/game-hub/admin/tables/${tableId}/moderate`, token: moderator.token, payload: { action: "HIDE", password: moderator.password, reason: "RC7 test" } });
  assert.equal(hidden.status, 200, JSON.stringify(hidden.body));
  assert.ok(await revocation(body => body.platformUserId === player.userId && body.reason === "table-hidden"));
});

test("RC7: deleting a table revokes its players", async () => {
  const { dm, player, tableId } = await seatedTable("delete");
  const deleted = await api.request({ method: "DELETE", url: `/api/v1/game-hub/tables/${tableId}`, token: dm.token, payload: { confirmTitle: "RC7 delete" } });
  assert.ok(deleted.status === 200 || deleted.status === 202, JSON.stringify(deleted.body));
  assert.ok(await revocation(body => body.platformUserId === player.userId && body.platformTableId === tableId && body.reason === "table-deleted"));
});

test("RC7: banning or suspending an account revokes all its tables", async () => {
  const moderator = await admin();
  for (const [status, reason] of [["BANNED", "account-banned"], ["SUSPENDED", "account-suspended"]] as const) {
    const target = await api.register(`rc7${status.toLowerCase()}`);
    const changed = await api.request({ method: "PATCH", url: `/api/v1/admin/accounts/${target.userId}/status`, token: moderator.token, payload: { status, password: moderator.password, reason: "RC7 test" } });
    assert.equal(changed.status, 200, JSON.stringify(changed.body));
    const call = await revocation(body => body.platformUserId === target.userId);
    assert.equal(call?.body, JSON.stringify({ platformTableId: null, platformUserId: target.userId, reason }));
  }
});

test("RC7: signing out revokes the user's table sessions", async () => {
  const user = await api.register("rc7logout");
  const out = await api.request({ method: "POST", url: "/api/v1/auth/logout", token: user.token, payload: {} });
  assert.equal(out.status, 200);
  const call = await revocation(body => body.platformUserId === user.userId);
  assert.equal(call?.body, JSON.stringify({ platformTableId: null, platformUserId: user.userId, reason: "logout" }));
});
