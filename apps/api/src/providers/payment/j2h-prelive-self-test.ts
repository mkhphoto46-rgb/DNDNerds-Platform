import {
  buildZarinpalGatewayUrl,
} from "../../integrations/zarinpal.js";

import {
  zarinpalPaymentProvider,
} from "./zarinpal.js";

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

const authority =
  "A test/authority?value=1";

const direct =
  buildZarinpalGatewayUrl(
    authority,
  );

const resumed =
  zarinpalPaymentProvider
    .redirectUrlForIntent
    ?.(
      authority,
    );

assert(
  direct.startsWith(
    "https://",
  ),
  "ZarinPal gateway URL is not HTTPS.",
);

assert(
  direct.includes(
    encodeURIComponent(
      authority,
    ),
  ),
  "ZarinPal authority is not safely encoded.",
);

assert(
  resumed ===
    direct,
  "Existing ZarinPal payment cannot reconstruct its redirect URL.",
);

console.log(
  JSON.stringify(
    {
      zarinpalGatewayHttps:
        true,

      authorityEncoding:
        true,

      reusableRedirect:
        true,
    },
    null,
    2,
  ),
);
