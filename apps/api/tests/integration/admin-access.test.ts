import assert from "node:assert/strict";
import { test } from "node:test";
import { startApi } from "../support/api.js";

test("admin access rejects guests and regular users and preserves existing roles", async () => {
  const api = await startApi();
  try {
    const user = await api.register("admin-guard");
    const access = (token?: string) => api.request({ method: "GET", url: "/api/v1/admin/access", token });
    assert.equal((await access()).status, 401);
    assert.equal((await access(user.token)).status, 403);
    await api.query(`INSERT INTO marketplace_admins (user_id, role, active) VALUES ('${user.userId}', 'MARKETPLACE_ADMIN', true)`);
    assert.equal((await access(user.token)).body.data.role, "MARKETPLACE_ADMIN");
    process.env.ADMIN_REQUIRE_MFA = "true";
    assert.equal((await access(user.token)).body.error.code, "ADMIN_MFA_REQUIRED");
    assert.equal((await api.request({ method: "GET", url: "/api/v1/admin/control/tables", token: user.token })).status, 403);

    const { generateTotpSecret, encryptTotpSecret, totpCode } = await import("../../src/security/totp.js");
    const secret = generateTotpSecret();
    const { sqlClient } = await import("../../src/db/client.js");
    await sqlClient`insert into user_totp_mfa (user_id, encrypted_secret, enabled, confirmed_at)
      values (${user.userId}, ${encryptTotpSecret(secret)}, true, now())`;
    assert.equal((await access(user.token)).body.error.code, "ADMIN_MFA_LOGIN_REQUIRED");
    const login = await api.request({
      method: "POST", url: "/api/v1/auth/login", remoteAddress: user.address,
      payload: { email: user.email, password: user.password, totpCode: totpCode(secret, Math.floor(Date.now() / 1000)) },
    });
    assert.equal(login.status, 200);
    const token = login.body.sessionToken;
    assert.equal((await access(token)).body.data.role, "MARKETPLACE_ADMIN");
    await sqlClient`update user_sessions set revoked_at = now() where user_id = ${user.userId}`;
    assert.equal((await access(token)).status, 401);
  } finally {
    delete process.env.ADMIN_REQUIRE_MFA;
    await api.stop();
  }
});
