import {
  cookies,
} from "next/headers";

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