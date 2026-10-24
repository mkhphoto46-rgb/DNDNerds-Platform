import assert from "node:assert/strict";
import { test } from "node:test";
import {
  accountEmailReady,
  accountActionUrl,
  statusAfterVerification,
} from "./account-email-policy.js";

test("production email automation requires a configured SMTP sender", () => {
  const missing = { NODE_ENV: "production", EMAIL_PROVIDER: "smtp", SMTP_HOST: "smtp.example.com" };
  assert.equal(accountEmailReady(missing), false);
  assert.equal(accountEmailReady({ ...missing, SMTP_PORT: "587", SMTP_USER: "sender", SMTP_PASS: "secret", EMAIL_FROM: "hello@example.com" }), true);
  assert.equal(accountEmailReady({ NODE_ENV: "production", EMAIL_PROVIDER: "development" }), false);
  assert.equal(accountEmailReady({ EMAIL_PROVIDER: "brevo", EMAIL_FROM: "hello@example.com" }), false);
  assert.equal(accountEmailReady({ EMAIL_PROVIDER: "brevo", EMAIL_FROM: "hello@example.com", BREVO_API_KEY: "secret" }), true);
});

test("email proof activates pending accounts without lifting restrictions", () => {
  assert.equal(statusAfterVerification("PENDING_APPROVAL"), "ACTIVE");
  assert.equal(statusAfterVerification("SUSPENDED"), "SUSPENDED");
  assert.equal(statusAfterVerification("BANNED"), "BANNED");
});

test("account action links carry the single-use token in the fragment", () => {
  assert.equal(accountActionUrl("VERIFY_EMAIL", "abc123", "https://dndnerds.wispbyte.app/"), "https://dndnerds.wispbyte.app/verify-email#token=abc123");
  assert.equal(accountActionUrl("PASSWORD_RESET", "a+b", "https://dndnerds.wispbyte.app"), "https://dndnerds.wispbyte.app/reset-password#token=a%2Bb");
});
