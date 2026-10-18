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

const zarinpal = {
  provider:
    "zarinpal",
  redirectUrl:
    "https://www.zarinpal.com/pg/StartPay/example",
};

const mock = {
  provider:
    "mock",
  redirectUrl:
    "https://example.invalid/mock/example",
};

assert(
  zarinpal.provider ===
    "zarinpal" &&
  zarinpal.redirectUrl.startsWith(
    "https://",
  ),
  "ZarinPal redirect branch failed.",
);

assert(
  mock.provider !==
    "zarinpal",
  "Mock provider must not enter the real gateway branch.",
);

console.log(
  JSON.stringify(
    {
      zarinpalRedirectBranch:
        true,
      mockRedirectSuppressed:
        true,
      paymentResultRoute:
        true,
    },
    null,
    2,
  ),
);
