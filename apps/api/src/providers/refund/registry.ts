import type {
  RefundProvider,
} from "../contracts/refund-provider.js";

import {
  createMockRefundProvider,
} from "./mock.js";

import {
  zarinpalRefundProvider,
} from "./zarinpal.js";

const providers =
  new Map<
    string,
    RefundProvider
  >();

function register(
  provider:
    RefundProvider,
) {
  if (
    providers.has(
      provider.key,
    )
  ) {
    throw new Error(
      `Duplicate refund provider '${provider.key}'.`,
    );
  }

  providers.set(
    provider.key,
    provider,
  );
}

register(
  createMockRefundProvider(
    "mock",
  ),
);

register(
  createMockRefundProvider(
    "mock-secondary",
  ),
);

register(
  zarinpalRefundProvider,
);

export function listRefundProviders() {
  return Array.from(
    providers.keys(),
  );
}

export function findRefundProvider(
  key: string,
) {
  const resolved =
    key
      .trim()
      .toLowerCase();

  return (
    providers.get(
      resolved,
    ) ??
    null
  );
}
