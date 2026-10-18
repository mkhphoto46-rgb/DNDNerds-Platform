import {
  NextResponse,
} from "next/server";

import {
  SESSION_COOKIE,
  apiFetch,
} from "@/lib/bff-api";

export async function POST() {
  await apiFetch(
    "/api/v1/auth/logout",
    {
      method:
        "POST",

      headers: {
        "Content-Type":
          "application/json",
      },

      body:
        "{}",
    },
  );

  const response =
    NextResponse.json({
      ok:
        true,
    });

  response.cookies.set({
    name:
      SESSION_COOKIE,

    value:
      "",

    httpOnly:
      true,

    sameSite:
      "lax",

    path:
      "/",

    maxAge:
      0,
  });

  return response;
}