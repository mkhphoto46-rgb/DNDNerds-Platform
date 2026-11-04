import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { membershipRevokedRequest, sendMembershipRevoked } from "./vtt-membership-revoked.js";

const secret = "s".repeat(40);
const input = { platformTableId: "11111111-1111-4111-8111-111111111111", platformUserId: "22222222-2222-4222-8222-222222222222", reason: "seat-withdrawn" as const };
const quietLog = () => { const lines: string[] = []; return { lines, log: { info: (_o: unknown, m: string) => lines.push(`info ${m}`), warn: (_o: unknown, m: string) => lines.push(`warn ${m}`), debug: (_o: unknown, m: string) => lines.push(`debug ${m}`) } }; };

test("RC7: the body keeps the contract's key order and the signature is HMAC-SHA256 of timestamp:body", () => {
  const request = membershipRevokedRequest({ reason: "logout", platformUserId: input.platformUserId, platformTableId: null }, secret, 1_790_000_000_000);
  assert.equal(request.body, `{"platformTableId":null,"platformUserId":"${input.platformUserId}","reason":"logout"}`);
  assert.equal(request.headers["X-Platform-Timestamp"], "1790000000000");
  assert.equal(request.headers["X-Platform-Signature"], createHmac("sha256", secret).update(`1790000000000:${request.body}`).digest("hex"));
  assert.equal(request.headers["Content-Type"], "application/json");
});

test("RC7: it posts to the loopback bridge and logs success", async () => {
  const calls: { url: string; init: RequestInit }[] = [];
  const { lines, log } = quietLog();
  const ok = await sendMembershipRevoked(input, { secret, origin: "http://127.0.0.1:4200", log, request: async (url, init) => { calls.push({ url: String(url), init: init! }); return new Response("{}", { status: 200 }); } });
  assert.equal(ok, true);
  assert.equal(calls[0]?.url, "http://127.0.0.1:4200/api/platform/membership-revoked");
  assert.equal(calls[0]?.init.method, "POST");
  assert.ok(calls[0]?.init.signal, "a timeout signal is set");
  assert.ok(lines.some(line => line.startsWith("info")));
});

test("RC7: a public origin, a short secret or a failing bridge never throws and never sends", async () => {
  let sent = 0;
  const request = async () => { sent += 1; throw new Error("connection refused"); };
  const { lines, log } = quietLog();
  assert.equal(await sendMembershipRevoked(input, { secret, origin: "https://attacker.example", log, request }), false);
  assert.equal(await sendMembershipRevoked(input, { secret: "short", origin: "http://127.0.0.1:4200", log, request }), false);
  assert.equal(sent, 0);
  assert.equal(await sendMembershipRevoked(input, { secret, origin: "http://127.0.0.1:4200", log, request }), false);
  assert.equal(sent, 1);
  assert.ok(lines.some(line => line.startsWith("warn")));
  assert.equal(await sendMembershipRevoked(input, { secret, origin: "http://127.0.0.1:4200", log, request: async () => new Response("no", { status: 500 }) }), false);
});
