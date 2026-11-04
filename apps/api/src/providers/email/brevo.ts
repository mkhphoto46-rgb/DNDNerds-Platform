import type { EmailProvider } from "../contracts/email-provider.js";
import { accountActionUrl } from "../../email/account-email-policy.js";

export const brevoEmailProvider: EmailProvider = {
  key: "brevo",

  async sendAccountEmail(input) {
    const apiKey = process.env.BREVO_API_KEY?.trim();
    const from = process.env.EMAIL_FROM?.trim();
    if (!apiKey || !from) throw new Error("Brevo email sender is not configured.");

    const link = accountActionUrl(
      input.kind,
      input.token,
      process.env.PUBLIC_APP_URL ?? "http://localhost:3100",
    );
    const verifying = input.kind === "VERIFY_EMAIL";
    const textContent = [
      "DND Nerds",
      "",
      verifying
        ? "To verify your email and activate your account, open this link:"
        : "To choose a new password, open this link:",
      link,
      "",
      `This link expires in ${verifying ? 60 : 30} minutes.`,
      "If you did not request this action, ignore this message.",
    ].join("\n");

    const response = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        "api-key": apiKey,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        sender: { email: from },
        to: [{ email: input.to }],
        subject: verifying ? "Verify your DND Nerds email" : "Reset your DND Nerds password",
        textContent,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) {
      throw new Error(`Brevo rejected account email (HTTP ${response.status}).`);
    }
    const result = await response.json() as { messageId?: string };
    return { provider: "brevo", accepted: true, messageId: result.messageId };
  },

  async healthCheck() {
    const configured = Boolean(process.env.BREVO_API_KEY?.trim() && process.env.EMAIL_FROM?.trim());
    return { configured, healthy: configured, message: configured ? "Brevo is configured." : "Missing BREVO_API_KEY or EMAIL_FROM." };
  },
};
