import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getProviderConfig } from "./provider-config.js";
import { accountEmailReady } from "../../email/account-email-policy.js";

test("explicit email environment wins over development file, and readiness agrees with file fallback", () => {
  const dir = mkdtempSync(join(tmpdir(), "dnd-email-selection-"));
  const saved = { ...process.env };
  try {
    process.env.PROVIDER_CONFIG_FILE = join(dir, "providers.json");
    process.env.NODE_ENV = "test";
    writeFileSync(process.env.PROVIDER_CONFIG_FILE, JSON.stringify({ email: "development" }));
    process.env.EMAIL_PROVIDER = "resend";
    process.env.RESEND_API_KEY = "test-only";
    process.env.EMAIL_FROM = "sender@example.com";
    assert.equal(getProviderConfig().email, "resend");
    assert.equal(accountEmailReady(), true);
    delete process.env.EMAIL_PROVIDER;
    writeFileSync(process.env.PROVIDER_CONFIG_FILE, JSON.stringify({ email: "resend" }));
    assert.equal(getProviderConfig().email, "resend");
    assert.equal(accountEmailReady(), true);
    delete process.env.RESEND_API_KEY;
    assert.equal(accountEmailReady(), false);
  } finally {
    for (const key of Object.keys(process.env)) if (!(key in saved)) delete process.env[key];
    Object.assign(process.env, saved);
    rmSync(dir, { recursive: true });
  }
});
