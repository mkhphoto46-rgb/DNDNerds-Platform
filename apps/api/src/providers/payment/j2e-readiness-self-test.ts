import {
  evaluateLivePaymentReadiness,
} from "./live-readiness.js";

function assert(
  condition: boolean,
  message: string,
) {
  if (!condition) {
    throw new Error(
      message,
    );
  }
}

async function main() {
  const ready =
    evaluateLivePaymentReadiness({
      provider:
        "zarinpal",

      publicApiUrl:
        "https://api.example.test",

      publicAppUrl:
        "https://app.example.test",

      merchantId:
        "00000000-0000-4000-8000-000000000001",
    });

  assert(
    ready.ready,
    "Synthetic valid live-payment configuration was rejected.",
  );

  assert(
    ready.callbackTemplate ===
      "https://api.example.test/api/v1/payments/callback/zarinpal/:intentId",
    "Callback template is invalid.",
  );

  const localBlocked =
    evaluateLivePaymentReadiness({
      provider:
        "zarinpal",

      publicApiUrl:
        "http://127.0.0.1:4100",

      publicAppUrl:
        "http://localhost:3100",

      merchantId:
        "00000000-0000-4000-8000-000000000001",
    });

  assert(
    localBlocked.issues.includes(
      "PUBLIC_API_URL_MUST_BE_PUBLIC_HTTPS",
    ),
    "Local API URL was not blocked.",
  );

  assert(
    localBlocked.issues.includes(
      "PUBLIC_APP_URL_MUST_BE_PUBLIC_HTTPS",
    ),
    "Local app URL was not blocked.",
  );

  const merchantBlocked =
    evaluateLivePaymentReadiness({
      provider:
        "zarinpal",

      publicApiUrl:
        "https://api.example.test",

      publicAppUrl:
        "https://app.example.test",

      merchantId:
        "CHANGEME",
    });

  assert(
    merchantBlocked.issues.includes(
      "ZARINPAL_MERCHANT_ID_MISSING_OR_PLACEHOLDER",
    ),
    "Placeholder merchant id was not blocked.",
  );

  const mockBlocked =
    evaluateLivePaymentReadiness({
      provider:
        "mock",

      publicApiUrl:
        "https://api.example.test",

      publicAppUrl:
        "https://app.example.test",

      merchantId:
        "00000000-0000-4000-8000-000000000001",
    });

  assert(
    mockBlocked.issues.includes(
      "PAYMENT_PROVIDER_NOT_ZARINPAL",
    ),
    "Mock payment provider was accepted as live.",
  );

  console.log(
    JSON.stringify(
      {
        liveConfigValidation:
          true,

        publicHttpsRequired:
          true,

        placeholderMerchantBlocked:
          true,

        mockProviderBlocked:
          true,

        callbackTemplate:
          ready.callbackTemplate,
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
