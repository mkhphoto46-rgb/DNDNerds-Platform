// C3: the API sits behind nginx and the website's server-side proxy, so every
// request arrives from 127.0.0.1. Rate limits must key on the visitor address the
// local proxy forwards, and a remote caller must not be able to pick its own key.
import assert from "node:assert/strict";
import { after, before, test } from "node:test";

import { startApi, type TestApi } from "../support/api.js";

let api: TestApi;
before(async () => { api = await startApi(); });
after(async () => { await api?.stop(); });

const login = (email: string, password: string, remoteAddress: string, forwardedFor?: string) =>
  api.request({
    method: "POST", url: "/api/v1/auth/login", remoteAddress,
    headers: forwardedFor ? { "x-forwarded-for": forwardedFor } : {},
    payload: { email, password },
  });

test("one visitor's failed logins through the local proxy don't lock out another visitor", async () => {
  const victim = await api.register("victim");
  const other = await api.register("other");
  let last = 0;
  for (let attempt = 0; attempt < 12; attempt += 1) {
    last = (await login(victim.email, "wrong-password-123", "127.0.0.1", "203.0.113.10")).status;
  }
  assert.equal(last, 429, "the attacking visitor is rate-limited");
  const allowed = await login(other.email, other.password, "127.0.0.1", "203.0.113.20");
  assert.equal(allowed.status, 200, JSON.stringify(allowed.body));
});

test("a remote caller can't escape the limit by sending its own X-Forwarded-For", async () => {
  const target = await api.register("target");
  let last = 0;
  for (let attempt = 0; attempt < 12; attempt += 1) {
    last = (await login(target.email, "wrong-password-123", "198.51.100.7", `192.0.2.${attempt + 1}`)).status;
  }
  assert.equal(last, 429);
});
