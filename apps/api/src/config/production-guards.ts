import {
  getProviderConfig,
} from "../providers/config/provider-config.js";

type ProductionProviderConfig = {
  payment: string;
  email: string;
  payout: string;
};

type ProductionEnv =
  Record<
    string,
    string | undefined
  >;

function stableHttpsUrl(
  value:
    string | undefined,
) {
  if (!value) {
    return false;
  }

  try {
    const url =
      new URL(
        value,
      );

    if (
      url.protocol !==
      "https:"
    ) {
      return false;
    }

    const hostname =
      url.hostname
        .trim()
        .toLowerCase();

    if (
      !hostname ||
      hostname ===
        "localhost" ||
      hostname ===
        "127.0.0.1" ||
      hostname ===
        "::1" ||
      hostname.endsWith(
        ".localhost",
      ) ||
      hostname.endsWith(
        ".trycloudflare.com",
      )
    ) {
      return false;
    }

    return true;
  }
  catch {
    return false;
  }
}

function validRefundMethod(
  value:
    string | undefined,
) {
  const normalized =
    value
      ?.trim()
      .toUpperCase();

  return (
    normalized ===
      "CARD" ||
    normalized ===
      "PAYA"
  );
}

function boundedInteger(
  value:
    string | undefined,
  minimum: number,
  maximum: number,
) {
  if (!value) {
    return true;
  }

  const parsed =
    Number.parseInt(
      value,
      10,
    );

  return (
    Number.isInteger(
      parsed,
    ) &&
    parsed >=
      minimum &&
    parsed <=
      maximum
  );
}

export function productionReadinessIssues(
  env:
    ProductionEnv,
  providers:
    ProductionProviderConfig,
) {
  const missing:
    string[] = [];
  const freeLaunch = env.FREE_LAUNCH_MODE === "true";

  if (
    !env.REDIS_URL
  ) {
    missing.push(
      "REDIS_URL",
    );
  }

  if (
    !/^[0-9a-f]{64}$/i.test(env.MFA_ENCRYPTION_KEY ?? "")
  ) {
    missing.push(
      "MFA_ENCRYPTION_KEY(64 hex chars)",
    );
  }

  if (
    !/^[0-9a-f]{64}$/i.test(env.PAYOUT_DESTINATION_ENCRYPTION_KEY ?? "")
  ) {
    missing.push(
      "PAYOUT_DESTINATION_ENCRYPTION_KEY(64 hex chars)",
    );
  }

  if (
    !freeLaunch &&
    providers.payment
      .startsWith(
        "mock",
      )
  ) {
    missing.push(
      "PAYMENT_PROVIDER(non-mock)",
    );
  }

  if (
    !freeLaunch &&
    providers.email ===
    "development"
  ) {
    missing.push(
      "EMAIL_PROVIDER(non-development)",
    );
  }

  if (
    !freeLaunch &&
    providers.payout ===
    "mock"
  ) {
    missing.push(
      "PAYOUT_PROVIDER(non-mock)",
    );
  }

  if (
    !freeLaunch &&
    providers.payment ===
    "zarinpal"
  ) {
    for (
      const key of [
        "ZARINPAL_MERCHANT_ID",
        "ZARINPAL_ACCESS_TOKEN",
        "ZARINPAL_TERMINAL_ID",
      ] as const
    ) {
      if (
        !env[
          key
        ]
      ) {
        missing.push(
          key,
        );
      }
    }

    if (
      !validRefundMethod(
        env
          .ZARINPAL_REFUND_METHOD,
      )
    ) {
      missing.push(
        "ZARINPAL_REFUND_METHOD(CARD|PAYA)",
      );
    }
  }

  if (
    !freeLaunch &&
    providers.email ===
    "smtp"
  ) {
    for (
      const key of [
        "SMTP_HOST",
        "SMTP_PORT",
        "SMTP_USER",
        "SMTP_PASS",
        "EMAIL_FROM",
      ] as const
    ) {
      if (
        !env[
          key
        ]
      ) {
        missing.push(
          key,
        );
      }
    }
  }

  if (!freeLaunch && providers.email === "brevo") {
    for (const key of ["BREVO_API_KEY", "EMAIL_FROM"] as const) {
      if (!env[key]) missing.push(key);
    }
  }

  if (!freeLaunch && providers.email === "resend") {
    for (const key of ["RESEND_API_KEY", "EMAIL_FROM"] as const) {
      if (!env[key]) missing.push(key);
    }
  }

  if (
    !stableHttpsUrl(
      env
        .PUBLIC_APP_URL,
    )
  ) {
    missing.push(
      "PUBLIC_APP_URL(stable https)",
    );
  }

  if (
    !stableHttpsUrl(
      env
        .PUBLIC_API_URL,
    )
  ) {
    missing.push(
      "PUBLIC_API_URL(stable https)",
    );
  }

  if (
    !boundedInteger(
      env
        .FINANCE_RECONCILE_INTERVAL_MS,
      10_000,
      3_600_000,
    )
  ) {
    missing.push(
      "FINANCE_RECONCILE_INTERVAL_MS(10000..3600000)",
    );
  }

  if (
    !boundedInteger(
      env
        .FINANCE_RECONCILE_LIMIT,
      1,
      250,
    )
  ) {
    missing.push(
      "FINANCE_RECONCILE_LIMIT(1..250)",
    );
  }

  return missing;
}

export function assertProductionReady() {
  if (
    process.env.NODE_ENV !==
    "production"
  ) {
    return;
  }

  const providers =
    getProviderConfig();

  const missing =
    productionReadinessIssues(
      process.env,
      providers,
    );

  if (
    missing.length >
    0
  ) {
    throw new Error(
      "Production readiness guard failed: " +
      missing.join(
        ", ",
      ),
    );
  }
}
