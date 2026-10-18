import type {
  EmailProvider,
} from "../contracts/email-provider.js";

import {
  getProviderConfig,
} from "../config/provider-config.js";

import {
  developmentEmailProvider,
} from "./development.js";

import {
  smtpEmailProvider,
} from "./smtp.js";

const providers =
  new Map<
    string,
    EmailProvider
  >([
    [
      developmentEmailProvider
        .key,
      developmentEmailProvider,
    ],

    [
      smtpEmailProvider.key,
      smtpEmailProvider,
    ],
  ]);

export function getEmailProvider(
  key?: string,
) {
  const resolved =
    (
      key ??
      getProviderConfig()
        .email
    )
      .trim()
      .toLowerCase();

  const provider =
    providers.get(
      resolved,
    );

  if (!provider) {
    throw new Error(
      `Unknown email provider '${resolved}'.`,
    );
  }

  return provider;
}
