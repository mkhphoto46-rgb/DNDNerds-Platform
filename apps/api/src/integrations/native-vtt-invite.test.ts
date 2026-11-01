import test from "node:test";
import assert from "node:assert/strict";
import { createHmac, randomUUID } from "node:crypto";
import { requestNativeVttInvite } from "./native-vtt-invite.js";

test("native code resolution signs the authenticated player identity and returns only a validated ticket", async () => {
  const input = { code: "ABC234", userId: randomUUID(), username: "test_player" }, secret = "x".repeat(64);
  const result = await requestNativeVttInvite(input, secret, "http://localhost:4319", async (url, init) => {
    assert.equal(String(url), "http://localhost:4319/api/platform/invite");
    const headers = new Headers(init?.headers);
    assert.equal(headers.get("x-platform-signature"), createHmac("sha256", secret).update(`${headers.get("x-platform-timestamp")}:${init?.body}`).digest("hex"));
    assert.deepEqual(JSON.parse(String(init?.body)), input);
    return Response.json({ data: { ticket: "payload.signature" } });
  });
  assert.deepEqual(result, { status: 200, ticket: "payload.signature" });
  const unsafe = await requestNativeVttInvite(input, secret, "http://example.com", async () => { throw Error("must not contact public host"); });
  assert.equal(unsafe.status, 503);
  const invalid = await requestNativeVttInvite(input, secret, "http://localhost:4319", async () => Response.json({ data: { ticket: "https://evil.example" } }));
  assert.equal(invalid.status, 503);
});
