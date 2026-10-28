import {
  existsSync,
  readFileSync,
} from "node:fs";

import {
  resolve,
} from "node:path";

export type ProviderConfig = {
  payment: string;
  email: string;
  payout: string;
};

type ProviderConfigFile = {
  payment?: string;
  email?: string;
  payout?: string;
};

function normalized(
  value: string | undefined,
  fallback: string,
) {
  const result =
    (value ?? fallback)
      .trim()
      .toLowerCase();

  if (!result) {
    throw new Error(
      "Provider key cannot be empty.",
    );
  }

  return result;
}

export function providerConfigPath() {
  return (
    process.env
      .PROVIDER_CONFIG_FILE ??
    resolve(
      process.cwd(),
      "../../config/providers.json",
    )
  );
}

function readConfigFile():
  ProviderConfigFile {
  const path =
    providerConfigPath();

  if (
    !existsSync(
      path,
    )
  ) {
    return {};
  }

  const text =
    readFileSync(
      path,
      "utf8",
    );

  const parsed =
    JSON.parse(
      text,
    ) as
      ProviderConfigFile;

  return parsed;
}

export function getProviderConfig():
  ProviderConfig {
  const file =
    readConfigFile();

  const config = {
    payment:
      normalized(
        file.payment ??
          process.env
            .PAYMENT_PROVIDER,
        "mock",
      ),

    email:
      normalized(
        file.email ??
          process.env
            .EMAIL_PROVIDER,
        "development",
      ),

    payout:
      normalized(
        file.payout ??
          process.env
            .PAYOUT_PROVIDER,
        "mock",
      ),
  };

  if (
    process.env.NODE_ENV ===
      "production" &&
    process.env.FREE_LAUNCH_MODE !== "true"
  ) {
    if (
      config.payment.startsWith(
        "mock",
      )
    ) {
      throw new Error(
        "PAYMENT_PROVIDER must not use a mock provider in production.",
      );
    }

    if (
      config.email ===
      "development"
    ) {
      throw new Error(
        "EMAIL_PROVIDER must not use development in production.",
      );
    }

    if (
      config.payout ===
      "mock"
    ) {
      throw new Error(
        "PAYOUT_PROVIDER must not use mock in production.",
      );
    }
  }

  return config;
}
