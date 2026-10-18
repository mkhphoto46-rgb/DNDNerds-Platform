import type {
  AccountEmailKind,
  SendAccountEmailInput,
} from "../providers/contracts/email-provider.js";

import {
  getEmailProvider,
} from "../providers/email/registry.js";

export type {
  AccountEmailKind,
  SendAccountEmailInput,
};

export async function sendAccountEmail(
  input:
    SendAccountEmailInput,
) {
  return getEmailProvider()
    .sendAccountEmail(
      input,
    );
}
