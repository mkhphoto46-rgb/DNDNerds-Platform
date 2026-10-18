import {
  readFileSync,
  writeFileSync,
} from "node:fs";

import {
  getProviderConfig,
  providerConfigPath,
} from "./config/provider-config.js";

import {
  getPaymentProvider,
} from "./payment/registry.js";

function save(
  value: unknown,
) {
  writeFileSync(
    providerConfigPath(),
    JSON.stringify(
      value,
      null,
      2,
    ) +
      "\n",
    "utf8",
  );
}

async function main() {
  process.env.NODE_ENV =
    "development";

  const path =
    providerConfigPath();

  const original =
    readFileSync(
      path,
      "utf8",
    );

  try {
    save({
      payment:
        "mock",
      email:
        "development",
      payout:
        "mock",
    });

    const firstConfig =
      getProviderConfig();

    const first =
      getPaymentProvider();

    save({
      payment:
        "mock-secondary",
      email:
        "development",
      payout:
        "mock",
    });

    const secondConfig =
      getProviderConfig();

    const second =
      getPaymentProvider();

    if (
      first.key !==
        "mock" ||
      second.key !==
        "mock-secondary"
    ) {
      throw new Error(
        "Runtime provider switch failed.",
      );
    }

    if (
      firstConfig.payment ===
      secondConfig.payment
    ) {
      throw new Error(
        "Runtime config file was not re-read.",
      );
    }

    save({
      payment:
        "mock",
      email:
        "development",
      payout:
        "mock",
    });

    process.env.NODE_ENV =
      "production";

    let blocked =
      false;

    try {
      getProviderConfig();
    }
    catch {
      blocked =
        true;
    }

    if (!blocked) {
      throw new Error(
        "Production provider guard failed.",
      );
    }

    process.env.NODE_ENV =
      "development";

    console.log(
      JSON.stringify(
        {
          runtimeSwitch:
            true,

          fileReload:
            true,

          productionGuard:
            true,

          from:
            first.key,

          to:
            second.key,
        },
        null,
        2,
      ),
    );
  }
  finally {
    writeFileSync(
      path,
      original,
      "utf8",
    );
  }
}

main().catch(
  error => {
    console.error(
      error,
    );

    process.exit(
      1,
    );
  },
);
