export type EmailActionKind = "VERIFY_EMAIL" | "PASSWORD_RESET";

export function accountEmailReady(env: Record<string, string | undefined> = process.env): boolean {
  const provider = env.EMAIL_PROVIDER?.trim().toLowerCase();
  const required = provider === "smtp"
    ? ["SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASS", "EMAIL_FROM"]
    : provider === "brevo" ? ["BREVO_API_KEY", "EMAIL_FROM"]
    : provider === "resend" ? ["RESEND_API_KEY", "EMAIL_FROM"] : [];
  return required.length > 0 && required
    .every((key) => Boolean(env[key]?.trim()));
}

export function statusAfterVerification(status: string): string {
  return status === "PENDING_APPROVAL" ? "ACTIVE" : status;
}

export function accountActionUrl(kind: EmailActionKind, token: string, baseUrl: string): string {
  const path = kind === "VERIFY_EMAIL" ? "verify-email" : "reset-password";
  const url = new URL(path, `${baseUrl.replace(/\/+$/, "")}/`);
  url.hash = `token=${encodeURIComponent(token)}`;
  return url.toString();
}
