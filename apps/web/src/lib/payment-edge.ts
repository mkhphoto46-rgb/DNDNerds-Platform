const API_BASE_URL =
  process.env
    .MARKETPLACE_API_BASE_URL ??
  "http://127.0.0.1:4100";

const providerPattern =
  /^[a-z0-9][a-z0-9-]{0,63}$/;

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function safeProvider(
  value: string,
) {
  const normalized =
    value
      .trim()
      .toLowerCase();

  if (
    !providerPattern.test(
      normalized,
    )
  ) {
    return null;
  }

  return normalized;
}

function safeIntentId(
  value: string,
) {
  const normalized =
    value.trim();

  if (
    !uuidPattern.test(
      normalized,
    )
  ) {
    return null;
  }

  return normalized;
}

function upstreamCallbackUrl(
  requestUrl: string,
  provider: string,
  intentId: string,
) {
  const inbound =
    new URL(
      requestUrl,
    );

  const upstream =
    new URL(
      `/api/v1/payments/callback/${encodeURIComponent(
        provider,
      )}/${encodeURIComponent(
        intentId,
      )}`,
      API_BASE_URL,
    );

  inbound.searchParams.forEach(
    (
      value,
      key,
    ) => {
      upstream.searchParams.append(
        key,
        value,
      );
    },
  );

  return upstream;
}

function responseHeaders(
  upstream:
    Response,
) {
  const headers =
    new Headers();

  const contentType =
    upstream.headers.get(
      "content-type",
    );

  if (contentType) {
    headers.set(
      "content-type",
      contentType,
    );
  }

  headers.set(
    "cache-control",
    "no-store",
  );

  headers.set(
    "x-dnd-edge",
    "payment-callback",
  );

  return headers;
}

export async function proxyPaymentCallback(
  request:
    Request,
  rawProvider:
    string,
  rawIntentId:
    string,
) {
  const provider =
    safeProvider(
      rawProvider,
    );

  const intentId =
    safeIntentId(
      rawIntentId,
    );

  if (
    !provider ||
    !intentId
  ) {
    return Response.json(
      {
        error: {
          code:
            "INVALID_PAYMENT_CALLBACK_PATH",

          message:
            "Invalid payment callback path.",
        },
      },
      {
        status:
          400,

        headers: {
          "cache-control":
            "no-store",
        },
      },
    );
  }

  const upstreamUrl =
    upstreamCallbackUrl(
      request.url,
      provider,
      intentId,
    );

  const headers =
    new Headers();

  const accept =
    request.headers.get(
      "accept",
    );

  if (accept) {
    headers.set(
      "accept",
      accept,
    );
  }

  const contentType =
    request.headers.get(
      "content-type",
    );

  if (contentType) {
    headers.set(
      "content-type",
      contentType,
    );
  }

  const method =
    request.method
      .toUpperCase();

  const init:
    RequestInit = {
      method,
      headers,
      cache:
        "no-store",
      redirect:
        "manual",
    };

  if (
    method !==
      "GET" &&
    method !==
      "HEAD"
  ) {
    init.body =
      await request
        .arrayBuffer();
  }

  const upstream =
    await fetch(
      upstreamUrl,
      init,
    );

  const location =
    upstream.headers.get(
      "location",
    );

  if (
    location &&
    upstream.status >=
      300 &&
    upstream.status <
      400
  ) {
    return new Response(
      null,
      {
        status:
          upstream.status,

        headers: {
          location,
          "cache-control":
            "no-store",
          "x-dnd-edge":
            "payment-callback",
        },
      },
    );
  }

  const body =
    await upstream
      .arrayBuffer();

  return new Response(
    body,
    {
      status:
        upstream.status,

      headers:
        responseHeaders(
          upstream,
        ),
    },
  );
}
