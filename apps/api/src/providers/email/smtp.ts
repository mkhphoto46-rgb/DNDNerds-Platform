import {
  createTransport,
} from "nodemailer";

import type {
  EmailProvider,
  SendAccountEmailInput,
} from "../contracts/email-provider.js";
import { accountActionUrl } from "../../email/account-email-policy.js";

function requiredEnv(
  name: string,
) {
  const value =
    process.env[name];

  if (!value) {
    throw new Error(
      `${name} is required.`,
    );
  }

  return value;
}

function subject(
  input:
    SendAccountEmailInput,
) {
  return input.kind ===
    "VERIFY_EMAIL"
    ? "Verify your DND Nerds email"
    : "Reset your DND Nerds password";
}

function text(
  input:
    SendAccountEmailInput,
) {
  const baseUrl =
    process.env
      .PUBLIC_APP_URL ??
    "http://localhost:3100";

  const actionUrl = accountActionUrl(input.kind, input.token, baseUrl);

  return [
    "DND Nerds",
    "",
    input.kind === "VERIFY_EMAIL"
      ? "To verify your email and activate your account, open this link:"
      : "To choose a new password, open this link:",
    actionUrl,
    "",
    input.kind === "VERIFY_EMAIL" ? "This link expires in 60 minutes." : "This link expires in 30 minutes.",
    "",
    "If you did not request this action, ignore this message.",
  ].join(
    "\n",
  );
}

export const smtpEmailProvider:
  EmailProvider = {
  key:
    "smtp",

  async sendAccountEmail(
    input,
  ) {
    const port =
      Number.parseInt(
        requiredEnv(
          "SMTP_PORT",
        ),
        10,
      );

    if (
      !Number.isInteger(
        port,
      ) ||
      port <= 0
    ) {
      throw new Error(
        "SMTP_PORT is invalid.",
      );
    }

    const secure =
      (
        process.env
          .SMTP_SECURE ??
        "false"
      )
        .trim()
        .toLowerCase() ===
      "true";

    const transporter =
      createTransport({
        host:
          requiredEnv(
            "SMTP_HOST",
          ),

        port,

        secure,

        auth: {
          user:
            requiredEnv(
              "SMTP_USER",
            ),

          pass:
            requiredEnv(
              "SMTP_PASS",
            ),
        },
      });

    const info =
      await transporter
        .sendMail({
          from:
            requiredEnv(
              "EMAIL_FROM",
            ),

          to:
            input.to,

          subject:
            subject(
              input,
            ),

          text:
            text(
              input,
            ),
        });

    return {
      provider:
        "smtp",

      accepted:
        true,

      messageId:
        info.messageId,
    };
  },

  async healthCheck() {
    const required = [
      "SMTP_HOST",
      "SMTP_PORT",
      "SMTP_USER",
      "SMTP_PASS",
      "EMAIL_FROM",
    ];

    const missing =
      required.filter(
        key =>
          !process.env[key],
      );

    return {
      configured:
        missing.length ===
        0,

      healthy:
        missing.length ===
        0,

      message:
        missing.length ===
          0
          ? "SMTP is configured."
          : `Missing: ${missing.join(", ")}`,
    };
  },
};
