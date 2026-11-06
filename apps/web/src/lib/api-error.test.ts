import test from "node:test";
import assert from "node:assert/strict";
import { API_ERROR_TEXT, apiErrorMessage } from "./api-error.js";

const persian = /[\u0600-\u06FF]/;

test("B53: the English API errors users saw are shown in Persian", () => {
  const seen = [
    [{ error: { code: "RATE_LIMITED", message: "Too many requests. Try again later." } }, 429],
    [{ error: { code: "INVALID_CREDENTIALS", message: "Email or password is invalid." } }, 401],
    [{ error: { code: "CSRF_BLOCKED", message: "Cross-site state-changing request blocked." } }, 403],
  ] as const;
  for (const [body, status] of seen) {
    const text = apiErrorMessage(body, "خطا", status);
    assert.match(text, persian, text);
    assert.doesNotMatch(text, /[A-Za-z]{3,}/, text);
  }
});

test("B53: every mapped code has Persian text without English words", () => {
  for (const [code, text] of Object.entries(API_ERROR_TEXT)) {
    assert.match(text, persian, code);
    assert.doesNotMatch(text, /[A-Za-z]{3,}/, code);
  }
  for (const code of ["VALIDATION_ERROR", "USERNAME_TAKEN", "EMAIL_ALREADY_EXISTS", "SLUG_TAKEN", "APPLICATION_EXISTS", "CAPACITY_BELOW_SEATED", "INVALID_OR_EXPIRED_TOKEN", "MFA_REQUIRED"]) {
    assert.ok(API_ERROR_TEXT[code], code);
  }
});

test("B53: a Persian API message is kept; unknown English text falls back", () => {
  assert.equal(apiErrorMessage({ error: { code: "CAPACITY_BELOW_SEATED", message: "ظرفیت نمی‌تواند از ۳ کمتر باشد." } }, "خطا", 409), "ظرفیت نمی‌تواند از ۳ کمتر باشد.");
  assert.equal(apiErrorMessage({ error: { code: "REQUEST_ERROR", message: "Something odd happened" } }, "درخواست انجام نشد.", 400), "درخواست انجام نشد.");
  assert.equal(apiErrorMessage({ error: { message: "Too many requests" } }, "خطا", 429), API_ERROR_TEXT.RATE_LIMITED);
  assert.equal(apiErrorMessage(null, "خطا"), "خطا");
  assert.equal(apiErrorMessage("<html>", "خطا", 502), "خطا");
});
