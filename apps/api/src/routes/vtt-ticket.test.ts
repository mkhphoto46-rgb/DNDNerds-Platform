import assert from "node:assert/strict";
import { test } from "node:test";
import { createVttTicket, verifyVttTicket } from "./vtt-ticket.js";

const secret = "a-test-secret-that-is-at-least-thirty-two-bytes-long";
const payload = { tableId: "af5c013d-041e-44bb-9dc4-f6fb08a716a9", userId: "23a99f86-adca-4b48-8adc-e985c6db6908", hostUserId: "23a99f86-adca-4b48-8adc-e985c6db6908", title: "The Keep", username: "example_dm", role: "dm" as const };

test("a signed launch ticket carries the intended role and expires", () => {
  const ticket = createVttTicket(payload, secret, 1_000_000);
  assert.deepEqual(verifyVttTicket(ticket, secret, 1_000_001), { ...payload, expiresAt: 1_060_000 });
  assert.equal(verifyVttTicket(ticket, secret, 1_060_001), null);
});

test("changing a player ticket to DM is rejected", () => {
  const ticket = createVttTicket({ ...payload, role: "player" }, secret, 1_000_000);
  const [body, signature] = ticket.split(".");
  assert.ok(body && signature);
  const tampered = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(body, "base64url").toString()), role: "dm" })).toString("base64url");
  assert.equal(verifyVttTicket(`${tampered}.${signature}`, secret, 1_000_001), null);
});
