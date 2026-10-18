type ZarinpalRequestData = {
  code?: number;
  authority?: string;
  fee_type?: string;
  fee?: number;
};

type ZarinpalVerifyData = {
  code?: number;
  ref_id?: number;
  card_pan?: string;
  card_hash?: string;
  fee_type?: string;
  fee?: number;
};

type ZarinpalEnvelope<T> = {
  data?: T;
  errors?: {
    code?: number;
    message?: string;
    validations?: unknown[];
  };
};

function trustedZarinpalUrl(
  raw:
    string,
  label:
    string,
  expectedHostname:
    string,
) {
  let parsed:
    URL;

  try {
    parsed =
      new URL(
        raw,
      );
  }
  catch {
    throw new Error(
      `${label} is invalid.`,
    );
  }

  if (
    parsed.protocol !==
    "https:"
  ) {
    throw new Error(
      `${label} must use HTTPS.`,
    );
  }

  if (
    parsed.hostname
      .toLowerCase() !==
    expectedHostname
  ) {
    throw new Error(
      `${label} must use the official ${expectedHostname} host.`,
    );
  }

  if (
    parsed.username ||
    parsed.password ||
    parsed.port ||
    parsed.search ||
    parsed.hash
  ) {
    throw new Error(
      `${label} contains unsupported URL components.`,
    );
  }

  return parsed;
}

export function resolveZarinpalApiBase(
  rawOverride =
    process.env
      .ZARINPAL_API_BASE,
) {
  const raw =
    (
      rawOverride ??
      "https://api.zarinpal.com"
    ).trim();

  const parsed =
    trustedZarinpalUrl(
      raw,
      "ZARINPAL_API_BASE",
      "api.zarinpal.com",
    );

  if (
    parsed.pathname !==
      "/" &&
    parsed.pathname !==
      ""
  ) {
    throw new Error(
      "ZARINPAL_API_BASE must not include an extra path.",
    );
  }

  return (
    "https://api.zarinpal.com"
  );
}

export function resolveZarinpalStartPayBase(
  rawOverride =
    process.env
      .ZARINPAL_STARTPAY_BASE,
) {
  const raw =
    (
      rawOverride ??
      "https://www.zarinpal.com/pg/StartPay"
    ).trim();

  const parsed =
    trustedZarinpalUrl(
      raw,
      "ZARINPAL_STARTPAY_BASE",
      "www.zarinpal.com",
    );

  const normalizedPath =
    parsed.pathname
      .replace(
        /\/+$/,
        "",
      );

  if (
    normalizedPath !==
    "/pg/StartPay"
  ) {
    throw new Error(
      "ZARINPAL_STARTPAY_BASE must use the official /pg/StartPay path.",
    );
  }

  return (
    "https://www.zarinpal.com/pg/StartPay"
  );
}

function apiBase() {
  return (
    resolveZarinpalApiBase()
  );
}

function startPayBase() {
  return (
    resolveZarinpalStartPayBase()
  );
}

export function buildZarinpalGatewayUrl(
  authority: string,
) {
  const value =
    authority.trim();

  if (!value) {
    throw new Error(
      "ZarinPal authority cannot be empty.",
    );
  }

  return (
    `${startPayBase()}/${encodeURIComponent(
      value,
    )}`
  );
}

function merchantId() {
  const value =
    process.env
      .ZARINPAL_MERCHANT_ID;

  if (!value) {
    throw new Error(
      "ZARINPAL_MERCHANT_ID is required.",
    );
  }

  return value;
}

function gatewayAmount(
  amountRial: number,
) {
  if (
    !Number.isInteger(
      amountRial,
    ) ||
    amountRial <= 0
  ) {
    throw new Error(
      "amountRial must be a positive integer.",
    );
  }

  const divisor =
    Number.parseInt(
      process.env
        .ZARINPAL_AMOUNT_DIVISOR ??
      "10",
      10,
    );

  if (
    !Number.isInteger(
      divisor,
    ) ||
    divisor <= 0
  ) {
    throw new Error(
      "ZARINPAL_AMOUNT_DIVISOR is invalid.",
    );
  }

  if (
    amountRial %
      divisor !==
    0
  ) {
    throw new Error(
      "IRR amount is not exactly convertible to the configured ZarinPal amount unit.",
    );
  }

  return amountRial /
    divisor;
}

async function postJson<T>(
  path: string,
  body: unknown,
) {
  const response =
    await fetch(
      `${apiBase()}${path}`,
      {
        method:
          "POST",

        headers: {
          "Content-Type":
            "application/json",

          "User-Agent":
            "DND-Nerds/1.0",
        },

        body:
          JSON.stringify(
            body,
          ),

        signal:
          AbortSignal.timeout(
            15_000,
          ),
      },
    );

  const text =
    await response.text();

  let parsed:
    ZarinpalEnvelope<T>;

  try {
    parsed =
      JSON.parse(
        text,
      ) as
        ZarinpalEnvelope<T>;
  }
  catch {
    throw new Error(
      `ZarinPal returned non-JSON HTTP ${response.status}.`,
    );
  }

  if (
    !response.ok
  ) {
    throw new Error(
      `ZarinPal HTTP ${response.status}: ${
        parsed.errors?.message ??
        "request failed"
      }`,
    );
  }

  if (
    parsed.errors &&
    Object.keys(
      parsed.errors,
    ).length >
      0
  ) {
    throw new Error(
      `ZarinPal error ${
        parsed.errors.code ??
        "unknown"
      }: ${
        parsed.errors.message ??
        "request failed"
      }`,
    );
  }

  if (!parsed.data) {
    throw new Error(
      "ZarinPal response data is missing.",
    );
  }

  return parsed.data;
}

export async function requestZarinpalPayment(
  input: {
    amountRial: number;
    callbackUrl: string;
    description: string;
    email?: string;
    mobile?: string;
  },
) {
  const amount =
    gatewayAmount(
      input.amountRial,
    );

  const data =
    await postJson<
      ZarinpalRequestData
    >(
      "/pg/v4/payment/request.json",
      {
        merchant_id:
          merchantId(),

        amount,

        callback_url:
          input.callbackUrl,

        description:
          input.description,

        metadata: {
          ...(input.email
            ? {
                email:
                  input.email,
              }
            : {}),

          ...(input.mobile
            ? {
                mobile:
                  input.mobile,
              }
            : {}),
        },
      },
    );

  if (
    data.code !==
      100 ||
    !data.authority
  ) {
    throw new Error(
      `ZarinPal payment request rejected with code ${
        data.code ??
        "unknown"
      }.`,
    );
  }

  return {
    authority:
      data.authority,

    gatewayUrl:
      buildZarinpalGatewayUrl(
        data.authority,
      ),

    amount,
  };
}

export async function verifyZarinpalPayment(
  input: {
    amountRial: number;
    authority: string;
  },
) {
  const amount =
    gatewayAmount(
      input.amountRial,
    );

  const data =
    await postJson<
      ZarinpalVerifyData
    >(
      "/pg/v4/payment/verify.json",
      {
        merchant_id:
          merchantId(),

        amount,

        authority:
          input.authority,
      },
    );

  const success =
    data.code ===
      100 ||
    data.code ===
      101;

  return {
    success,

    code:
      data.code ??
      null,

    refId:
      data.ref_id ??
      null,

    cardPan:
      data.card_pan ??
      null,

    cardHash:
      data.card_hash ??
      null,

    amount,
  };
}