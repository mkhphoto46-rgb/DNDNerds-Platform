import {
  appendFile,
  mkdir,
} from "node:fs/promises";

import {
  dirname,
  resolve,
} from "node:path";

import type {
  EmailProvider,
} from "../contracts/email-provider.js";

export const developmentEmailProvider:
  EmailProvider = {
  key:
    "development",

  async sendAccountEmail(
    input,
  ) {
    const outbox =
      resolve(
        process.cwd(),
        "../../logs/email-outbox.log",
      );

    await mkdir(
      dirname(
        outbox,
      ),
      {
        recursive:
          true,
      },
    );

    await appendFile(
      outbox,
      JSON.stringify({
        timestamp:
          new Date()
            .toISOString(),

        ...input,
      }) +
        "\n",
      "utf8",
    );

    return {
      provider:
        "development",

      accepted:
        true,
    };
  },

  async healthCheck() {
    return {
      configured:
        true,
      healthy:
        true,
      message:
        "Development email outbox is available.",
    };
  },
};
