import assert from "node:assert/strict";
import test from "node:test";
import { visitorAddress } from "./visitor-address.js";

const h = (values: Record<string, string>) => new Headers(values);

test("uses the entry the reverse proxy appended, not client-supplied ones", () => {
  assert.equal(visitorAddress(h({ "x-forwarded-for": "6.6.6.6, 203.0.113.9" })), "203.0.113.9");
  assert.equal(visitorAddress(h({ "x-forwarded-for": "2001:db8::1" })), "2001:db8::1");
});

test("falls back to X-Real-IP and rejects anything that isn't an address", () => {
  assert.equal(visitorAddress(h({ "x-real-ip": "198.51.100.4" })), "198.51.100.4");
  assert.equal(visitorAddress(h({ "x-forwarded-for": "unknown, not-an-address" })), null);
  assert.equal(visitorAddress(h({})), null);
});
