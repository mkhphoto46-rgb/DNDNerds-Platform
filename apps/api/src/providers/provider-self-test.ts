import {
  getProviderConfig,
} from "./config/provider-config.js";

import {
  getPaymentProvider,
  listPaymentProviders,
} from "./payment/registry.js";

async function main() {
  process.env.NODE_ENV =
    "development";

  process.env.EMAIL_PROVIDER =
    "development";

  process.env.PAYOUT_PROVIDER =
    "mock";

  process.env.PAYMENT_PROVIDER =
    "mock";

  const first =
    getPaymentProvider();

  const firstCreated =
    await first
      .createPayment({
        paymentIntentId:
          "00000000-0000-4000-8000-000000000001",

        amountRial:
          1_450_000,

        callbackUrl:
          "https://example.test/callback",

        description:
          "Provider self test",
      });

  process.env.PAYMENT_PROVIDER =
    "mock-secondary";

  const second =
    getPaymentProvider();

  const secondCreated =
    await second
      .createPayment({
        paymentIntentId:
          "00000000-0000-4000-8000-000000000002",

        amountRial:
          1_450_000,

        callbackUrl:
          "https://example.test/callback",

        description:
          "Provider self test",
      });

  if (
    first.key ===
    second.key
  ) {
    throw new Error(
      "Provider switch did not change the selected provider.",
    );
  }

  if (
    firstCreated.provider ===
    secondCreated.provider
  ) {
    throw new Error(
      "Provider result did not reflect provider switching.",
    );
  }

  let productionGuardPassed =
    false;

  process.env.NODE_ENV =
    "production";

  process.env.PAYMENT_PROVIDER =
    "mock";

  try {
    getProviderConfig();
  }
  catch {
    productionGuardPassed =
      true;
  }

  if (
    !productionGuardPassed
  ) {
    throw new Error(
      "Production mock-payment guard failed.",
    );
  }

  process.env.NODE_ENV =
    "development";

  console.log(
    JSON.stringify(
      {
        registeredPaymentProviders:
          listPaymentProviders(),

        firstProvider:
          first.key,

        secondProvider:
          second.key,

        switchVerified:
          true,

        productionMockGuard:
          true,
      },
      null,
      2,
    ),
  );
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
