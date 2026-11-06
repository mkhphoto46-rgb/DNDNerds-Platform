import {
  cookies,
  headers as incomingHeaders,
} from "next/headers";

import {
  visitorAddress,
} from "./visitor-address";

export const SESSION_COOKIE =
  "dnd_session";

const API_BASE =
  process.env
    .MARKETPLACE_API_BASE_URL ??
  "http://127.0.0.1:4100";

export async function getSessionToken() {
  const store =
    await cookies();

  return (
    store.get(
      SESSION_COOKIE,
    )?.value ??
    null
  );
}

/**
 * C3: the API sees every website request coming from this server, so pass on the
 * visitor's address. The API trusts it only from a loopback peer (API_TRUST_PROXY).
 */
export async function forwardedForHeaders(): Promise<Record<string, string>> {
  try {
    const address = visitorAddress(await incomingHeaders());
    return address ? { "X-Forwarded-For": address } : {};
  } catch {
    // Outside a request (build time, background work) there is no visitor.
    return {};
  }
}

export async function apiFetch(
  path: string,
  init:
    RequestInit = {},
) {
  const token =
    await getSessionToken();

  const headers =
    new Headers(
      init.headers,
    );

  if (token) {
    headers.set(
      "Authorization",
      `Bearer ${token}`,
    );
  }

  for (const [name, value] of Object.entries(await forwardedForHeaders())) {
    headers.set(name, value);
  }

  return fetch(
    `${API_BASE}${path}`,
    {
      ...init,
      headers,
      cache:
        "no-store",
    },
  );
}

export function publicSessionCookie(
  token: string,
) {
  return {
    name:
      SESSION_COOKIE,

    value:
      token,

    httpOnly:
      true,

    secure:
      process.env.NODE_ENV ===
      "production",

    sameSite:
      "lax" as const,

    path:
      "/",

    maxAge:
      30 *
      24 *
      60 *
      60,
  };
}