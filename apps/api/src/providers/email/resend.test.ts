import assert from "node:assert/strict";
import test from "node:test";
import { resendEmailProvider } from "./resend.js";
import { accountEmailReady } from "../../email/account-email-policy.js";

test("Resend account mail uses the production action URL and rejects failed deliveries", async () => {
  const previous = { key: process.env.RESEND_API_KEY, from: process.env.EMAIL_FROM, url: process.env.PUBLIC_APP_URL, fetch: globalThis.fetch };
  process.env.RESEND_API_KEY = "test-key";
  process.env.EMAIL_FROM = "DND Nerds <noreply@dndnerds.ir>";
  process.env.PUBLIC_APP_URL = "https://dndnerds.ir";
  try {
    assert.equal(accountEmailReady({ EMAIL_PROVIDER: "resend", RESEND_API_KEY: "key", EMAIL_FROM: "noreply@dndnerds.ir" }), true);
    assert.equal(accountEmailReady({ EMAIL_PROVIDER: "resend", EMAIL_FROM: "noreply@dndnerds.ir" }), false);
    globalThis.fetch = async (url, init) => {
      assert.equal(url, "https://api.resend.com/emails");
      const body = JSON.parse(init?.body as string);
      assert.deepEqual(body.to, ["member@example.com"]);
      assert.match(body.text, /https:\/\/dndnerds.ir\/verify-email#token=opaque-token/);
      assert.equal(body.reply_to, "info@dndnerds.ir");
      assert.ok((init?.headers as Record<string,string>)["Idempotency-Key"]);
      return new Response(JSON.stringify({ id: "email-id" }), { status: 200 });
    };
    assert.equal((await resendEmailProvider.sendAccountEmail({to:"member@example.com",kind:"VERIFY_EMAIL",token:"opaque-token"})).messageId, "email-id");
    globalThis.fetch = async () => new Response("not verified", {status:403});
    await assert.rejects(resendEmailProvider.sendAccountEmail({to:"member@example.com",kind:"PASSWORD_RESET",token:"token"}), /HTTP 403/);
  } finally {
    for (const [name,value] of [["RESEND_API_KEY",previous.key],["EMAIL_FROM",previous.from],["PUBLIC_APP_URL",previous.url]]) {
      if (value === undefined) delete process.env[name!]; else process.env[name!] = value;
    }
    globalThis.fetch = previous.fetch;
  }
});
