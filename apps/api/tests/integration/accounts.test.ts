// Accounts and sessions against a real database and Redis: registration,
// login, the session list, revocation, and password reset revoking sessions.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { after, before, test } from "node:test";

import { startApi, type TestApi } from "../support/api.js";

let api: TestApi;
before(async () => { api = await startApi(); });
after(async () => { await api?.stop(); });

test("register, then log in; a wrong password and a duplicate email are refused", async () => {
  const user = await api.register("login");
  const me = await api.request({ method: "GET", url: "/api/v1/auth/me", token: user.token });
  assert.equal(me.status, 200);
  assert.equal(JSON.stringify(me.body).includes(user.email), true);

  const duplicate = await api.request({ method: "POST", url: "/api/v1/auth/register", payload: { email: user.email, password: user.password } });
  assert.equal(duplicate.status, 409);
  const wrong = await api.request({ method: "POST", url: "/api/v1/auth/login", payload: { email: user.email, password: `${user.password}x` }, remoteAddress: user.address });
  assert.equal(wrong.status, 401);
  const login = await api.request({ method: "POST", url: "/api/v1/auth/login", payload: { email: user.email, password: user.password }, remoteAddress: user.address });
  assert.equal(login.status, 200);
  assert.ok(login.body.sessionToken);
  assert.notEqual(login.body.sessionToken, user.token);
});

test("a short password is refused; no session without a token", async () => {
  const short = await api.request({ method: "POST", url: "/api/v1/auth/register", payload: { email: "short@example.test", password: "short" } });
  assert.equal(short.status, 400);
  const anonymous = await api.request({ method: "GET", url: "/api/v1/auth/me" });
  assert.equal(anonymous.status, 401);
});

test("the session list shows each login, and revoking the others ends them", async () => {
  const user = await api.register("sessions");
  const second = await api.request({ method: "POST", url: "/api/v1/auth/login", payload: { email: user.email, password: user.password }, remoteAddress: user.address });
  const list = await api.request({ method: "GET", url: "/api/v1/account/sessions", token: user.token });
  assert.equal(list.status, 200);
  const sessions = list.body.sessions ?? list.body.data ?? list.body;
  assert.ok(Array.isArray(sessions) && sessions.length >= 2, JSON.stringify(list.body));

  const revoke = await api.request({ method: "POST", url: "/api/v1/account/sessions/revoke-others", token: user.token, payload: {} });
  assert.equal(revoke.status, 200, JSON.stringify(revoke.body));
  assert.equal((await api.request({ method: "GET", url: "/api/v1/auth/me", token: second.body.sessionToken })).status, 401);
  assert.equal((await api.request({ method: "GET", url: "/api/v1/auth/me", token: user.token })).status, 200);
});

test("logout ends the session", async () => {
  const user = await api.register("logout");
  const out = await api.request({ method: "POST", url: "/api/v1/auth/logout", token: user.token, payload: {} });
  assert.ok(out.status === 200 || out.status === 204, String(out.status));
  assert.equal((await api.request({ method: "GET", url: "/api/v1/auth/me", token: user.token })).status, 401);
});

test("a password reset changes the password and ends every session", async () => {
  const user = await api.register("reset");
  const requested = await api.request({ method: "POST", url: "/api/v1/account/password-reset/request", payload: { email: user.email }, remoteAddress: user.address });
  assert.ok(requested.status === 200 || requested.status === 202, JSON.stringify(requested.body));
  // The development email provider writes to logs/email-outbox.log at the repository root.
  const outbox = path.resolve(process.cwd(), "../../logs/email-outbox.log");
  const message = fs.readFileSync(outbox, "utf8").trim().split("\n").map((line) => JSON.parse(line)).reverse()
    .find((entry) => JSON.stringify(entry).includes(user.email));
  const token = JSON.stringify(message).match(/token[=":]+([A-Za-z0-9_-]{20,})/)?.[1];
  assert.ok(token, "reset token in the outbox");

  const newPassword = `${user.password}-new`;
  const confirmed = await api.request({ method: "POST", url: "/api/v1/account/password-reset/confirm", payload: { token, password: newPassword, newPassword }, remoteAddress: user.address });
  assert.equal(confirmed.status, 200, JSON.stringify(confirmed.body));
  assert.equal((await api.request({ method: "GET", url: "/api/v1/auth/me", token: user.token })).status, 401);
  assert.equal((await api.request({ method: "POST", url: "/api/v1/auth/login", payload: { email: user.email, password: user.password }, remoteAddress: user.address })).status, 401);
  assert.equal((await api.request({ method: "POST", url: "/api/v1/auth/login", payload: { email: user.email, password: newPassword }, remoteAddress: user.address })).status, 200);
});

test("repeated failed logins from one address are rate limited", async () => {
  const user = await api.register("limited");
  const statuses: number[] = [];
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const response = await api.request({ method: "POST", url: "/api/v1/auth/login", payload: { email: user.email, password: "Wrong-password-0000" }, remoteAddress: "10.99.0.1" });
    statuses.push(response.status);
    if (response.status === 429) break;
  }
  assert.equal(statuses.at(-1), 429, statuses.join(","));
});
