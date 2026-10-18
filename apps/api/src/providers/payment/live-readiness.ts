import {
  getProviderConfig,
} from "../config/provider-config.js";

export type LivePaymentReadiness = {
  ready: boolean;
  provider: string;
  publicApiUrl: string | null;
  publicAppUrl: string | null;
  callbackTemplate: string | null;
  merchantConfigured: boolean;
  issues: string[];
};

function normalizeBaseUrl(
  value:
    string | undefined,
) {
  if (!value) {
    return null;
  }

  const trimmed =
    value.trim()
      .replace(
        /\/+$/,
        "",
      );

  return trimmed || null;
}

function isPublicHttpsUrl(
  value:
    string | null,
) {
  if (!value) {
    return false;
  }

  try {
    const url =
      new URL(
        value,
      );

    if (
      url.protocol !==
      "https:"
    ) {
      return false;
    }

    const hostname =
      url.hostname
        .trim()
        .toLowerCase();

    if (
      hostname ===
        "localhost" ||
      hostname ===
        "127.0.0.1" ||
      hostname ===
        "::1" ||
      hostname.endsWith(
        ".local",
      )
    ) {
      return false;
    }

    return true;
  }
  catch {
    return false;
  }
}

function merchantLooksConfigured(
  value:
    string | undefined,
) {
  if (!value) {
    return false;
  }

  const trimmed =
    value.trim();

  if (
    trimmed.length <
      16
  ) {
    return false;
  }

  const upper =
    trimmed
      .toUpperCase();

  if (
    upper.includes(
      "CHANGEME",
    ) ||
    upper.includes(
      "REPLACE_ME",
    ) ||
    upper.includes(
      "YOUR_",
    )
  ) {
    return false;
  }

  return true;
}

export function evaluateLivePaymentReadiness(
  input?: {
    provider?: string;
    publicApiUrl?: string;
    publicAppUrl?: string;
    merchantId?: string;
  },
): LivePaymentReadiness {
  const provider =
    (
      input?.provider ??
      getProviderConfig()
        .payment
    )
      .trim()
      .toLowerCase();

  const publicApiUrl =
    normalizeBaseUrl(
      input?.publicApiUrl ??
      process.env
        .PUBLIC_API_URL,
    );

  const publicAppUrl =
    normalizeBaseUrl(
      input?.publicAppUrl ??
      process.env
        .PUBLIC_APP_URL,
    );

  const merchantConfigured =
    merchantLooksConfigured(
      input?.merchantId ??
      process.env
        .ZARINPAL_MERCHANT_ID,
    );

  const issues:
    string[] =
    [];

  if (
    provider !==
    "zarinpal"
  ) {
    issues.push(
      "PAYMENT_PROVIDER_NOT_ZARINPAL",
    );
  }

  if (
    !merchantConfigured
  ) {
    issues.push(
      "ZARINPAL_MERCHANT_ID_MISSING_OR_PLACEHOLDER",
    );
  }

  if (
    !isPublicHttpsUrl(
      publicApiUrl,
    )
  ) {
    issues.push(
      "PUBLIC_API_URL_MUST_BE_PUBLIC_HTTPS",
    );
  }

  if (
    !isPublicHttpsUrl(
      publicAppUrl,
    )
  ) {
    issues.push(
      "PUBLIC_APP_URL_MUST_BE_PUBLIC_HTTPS",
    );
  }

  return {
    ready:
      issues.length ===
      0,

    provider,

    publicApiUrl,

    publicAppUrl,

    callbackTemplate:
      publicApiUrl
        ? (
            `${publicApiUrl}` +
            "/api/v1/payments/callback/zarinpal/:intentId"
          )
        : null,

    merchantConfigured,

    issues,
  };
}
