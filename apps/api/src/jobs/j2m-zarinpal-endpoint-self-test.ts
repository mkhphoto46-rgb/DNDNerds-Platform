import {
  resolveZarinpalApiBase,
  resolveZarinpalStartPayBase,
} from "../integrations/zarinpal.js";

import {
  resolveZarinpalGraphqlUrl,
} from "../integrations/zarinpal-refunds.js";

function assert(
  condition:
    unknown,
  message:
    string,
) {
  if (!condition) {
    throw new Error(
      message,
    );
  }
}

function expectThrow(
  label:
    string,
  fn:
    () => unknown,
) {
  let threw =
    false;

  try {
    fn();
  }
  catch {
    threw =
      true;
  }

  assert(
    threw,
    `${label} should have been rejected.`,
  );
}

assert(
  resolveZarinpalApiBase(
    undefined,
  ) ===
    "https://api.zarinpal.com",
  "Default API endpoint mismatch.",
);

assert(
  resolveZarinpalStartPayBase(
    undefined,
  ) ===
    "https://www.zarinpal.com/pg/StartPay",
  "Default StartPay endpoint mismatch.",
);

assert(
  resolveZarinpalGraphqlUrl(
    undefined,
  ) ===
    "https://next.zarinpal.com/api/v4/graphql/",
  "Default GraphQL endpoint mismatch.",
);

assert(
  resolveZarinpalStartPayBase(
    "https://www.zarinpal.com/pg/StartPay/",
  ) ===
    "https://www.zarinpal.com/pg/StartPay",
  "StartPay trailing slash normalization failed.",
);

assert(
  resolveZarinpalGraphqlUrl(
    "https://next.zarinpal.com/api/v4/graphql",
  ) ===
    "https://next.zarinpal.com/api/v4/graphql/",
  "GraphQL trailing slash normalization failed.",
);

for (
  const candidate
  of [
    "http://api.zarinpal.com",
    "https://evil.example",
    "https://api.zarinpal.com.evil.example",
    "https://user:pass@api.zarinpal.com",
    "https://api.zarinpal.com:444",
    "https://api.zarinpal.com/evil",
  ]
) {
  expectThrow(
    `API endpoint ${candidate}`,
    () =>
      resolveZarinpalApiBase(
        candidate,
      ),
  );
}

for (
  const candidate
  of [
    "http://www.zarinpal.com/pg/StartPay",
    "https://zarinpal.com/pg/StartPay",
    "https://www.zarinpal.com.evil.example/pg/StartPay",
    "https://www.zarinpal.com/evil",
    "https://www.zarinpal.com:444/pg/StartPay",
  ]
) {
  expectThrow(
    `StartPay endpoint ${candidate}`,
    () =>
      resolveZarinpalStartPayBase(
        candidate,
      ),
  );
}

for (
  const candidate
  of [
    "http://next.zarinpal.com/api/v4/graphql/",
    "https://evil.example/api/v4/graphql/",
    "https://next.zarinpal.com.evil.example/api/v4/graphql/",
    "https://user:pass@next.zarinpal.com/api/v4/graphql/",
    "https://next.zarinpal.com:444/api/v4/graphql/",
    "https://next.zarinpal.com/evil",
  ]
) {
  expectThrow(
    `GraphQL endpoint ${candidate}`,
    () =>
      resolveZarinpalGraphqlUrl(
        candidate,
      ),
  );
}

console.log(
  JSON.stringify(
    {
      test:
        "J2M-E ZarinPal endpoint allowlist",

      status:
        "PASS",

      paymentApiHost:
        "api.zarinpal.com",

      startPayHost:
        "www.zarinpal.com",

      refundGraphqlHost:
        "next.zarinpal.com",

      maliciousOverridesRejected:
        true,
    },
    null,
    2,
  ),
);

console.log(
  "J2M_E_ZARINPAL_ENDPOINT_SELF_TEST_PASS",
);
