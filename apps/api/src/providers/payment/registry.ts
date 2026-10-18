import type {
  PaymentProvider,
} from "../contracts/payment-provider.js";

import {
  getProviderConfig,
} from "../config/provider-config.js";

import {
  createMockPaymentProvider,
} from "./mock.js";

import {
  zarinpalPaymentProvider,
} from "./zarinpal.js";

const providers =
  new Map<
    string,
    PaymentProvider
  >();

function register(
  provider:
    PaymentProvider,
) {
  if (
    providers.has(
      provider.key,
    )
  ) {
    throw new Error(
      `Duplicate payment provider '${provider.key}'.`,
    );
  }

  providers.set(
    provider.key,
    provider,
  );
}

register(
  createMockPaymentProvider(
    "mock",
  ),
);

register(
  createMockPaymentProvider(
    "mock-secondary",
  ),
);

register(
  zarinpalPaymentProvider,
);

export function listPaymentProviders() {
  return Array.from(
    providers.values(),
  ).map(
    provider => ({
      key:
        provider.key,

      capabilities:
        provider.capabilities,
    }),
  );
}

export function getPaymentProvider(
  key?: string,
) {
  const resolved =
    (
      key ??
      getProviderConfig()
        .payment
    )
      .trim()
      .toLowerCase();

  const provider =
    providers.get(
      resolved,
    );

  if (!provider) {
    throw new Error(
      `Unknown payment provider '${resolved}'.`,
    );
  }

  return provider;
}
