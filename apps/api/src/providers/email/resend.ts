import { createHash } from "node:crypto";
import type { EmailProvider } from "../contracts/email-provider.js";
import { accountActionUrl } from "../../email/account-email-policy.js";

export const resendEmailProvider: EmailProvider = {
  key: "resend",
  async sendAccountEmail(input) {
    const apiKey = process.env.RESEND_API_KEY?.trim();
    const from = process.env.EMAIL_FROM?.trim();
    if (!apiKey || !from) throw new Error("Resend email sender is not configured.");
    const verifying = input.kind === "VERIFY_EMAIL";
    const link = accountActionUrl(input.kind, input.token, process.env.PUBLIC_APP_URL ?? "http://localhost:3100");
    const text = [
      "DND Nerds",
      verifying ? "برای تأیید ایمیل و فعال‌سازی حساب، لینک زیر را باز کنید:" : "برای انتخاب رمز جدید، لینک زیر را باز کنید:",
      link,
      `اعتبار لینک: ${verifying ? 60 : 30} دقیقه.`,
      "اگر این درخواست را ثبت نکرده‌اید، این پیام را نادیده بگیرید.",
    ].join("\n\n");
    const idempotencyKey = createHash("sha256").update(`${input.kind}:${input.to}:${input.token}`).digest("hex");
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", "Idempotency-Key": idempotencyKey },
      body: JSON.stringify({ from, to: [input.to], reply_to: process.env.EMAIL_REPLY_TO?.trim() || "info@dndnerds.ir", subject: verifying ? "تأیید ایمیل حساب DND Nerds" : "بازیابی رمز حساب DND Nerds", text }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error(`Resend rejected account email (HTTP ${response.status}).`);
    const result = await response.json() as { id?: string };
    if (!result.id) throw new Error("Resend did not return an email identifier.");
    return { provider: "resend", accepted: true, messageId: result.id };
  },
  async healthCheck() {
    const configured = Boolean(process.env.RESEND_API_KEY?.trim() && process.env.EMAIL_FROM?.trim());
    return { configured, healthy: configured, message: configured ? "Resend is configured." : "Missing RESEND_API_KEY or EMAIL_FROM." };
  },
};
