import {
  NextResponse,
} from "next/server";

import {
  publicSessionCookie,
} from "@/lib/bff-api";

const API_BASE =
  process.env
    .MARKETPLACE_API_BASE_URL ??
  "http://127.0.0.1:4100";

export async function POST(
  request: Request,
) {
  const body =
    await request.text();

  const upstream =
    await fetch(
      `${API_BASE}/api/v1/auth/login`,
      {
        method:
          "POST",

        headers: {
          "Content-Type":
            "application/json",
        },

        body,

        cache:
          "no-store",
      },
    );

  const data =
    await upstream.json();

  if (!upstream.ok) {
    return NextResponse.json(
      data,
      {
        status:
          upstream.status,
      },
    );
  }

  const response =
    NextResponse.json({
      user:
        data.user,

      source:
        data.source,
    });

  response.cookies.set(
    publicSessionCookie(
      data.sessionToken,
    ),
  );

  return response;
}