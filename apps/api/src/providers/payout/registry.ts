import type {
  PayoutProvider,
} from "../contracts/payout-provider.js";

import {
  getProviderConfig,
} from "../config/provider-config.js";

import {
  genericMockPayoutProvider,
} from "./mock.js";

const providers =
  new Map<
    string,
    PayoutProvider
  >([
    [
      genericMockPayoutProvider
        .key,
      genericMockPayoutProvider,
    ],
  ]);

export function getGenericPayoutProvider(
  key?: string,
) {
  const resolved =
    (
      key ??
      getProviderConfig()
        .payout
    )
      .trim()
      .toLowerCase();

  const provider =
    providers.get(
      resolved,
    );

  if (!provider) {
    throw new Error(
      `Unknown payout provider '${resolved}'.`,
    );
  }

  return provider;
}
