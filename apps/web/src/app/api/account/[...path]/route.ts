import {
  NextResponse,
} from "next/server";

import {
  apiFetch,
} from "@/lib/bff-api";

async function forward(
  request: Request,
  context: {
    params:
      Promise<{
        path: string[];
      }>;
  },
) {
  const {
    path,
  } =
    await context.params;

  const suffix =
    path
      .map(
        encodeURIComponent,
      )
      .join("/");

  const headers =
    new Headers();

  const contentType =
    request.headers.get(
      "content-type",
    );

  if (contentType) {
    headers.set(
      "Content-Type",
      contentType,
    );
  }

  const init:
    RequestInit = {
      method:
        request.method,

      headers,
    };

  if (
    request.method !== "GET" &&
    request.method !== "HEAD"
  ) {
    init.body =
      await request.text();
  }

  const upstream =
    await apiFetch(
      `/api/v1/account/${suffix}`,
      init,
    );

  const data =
    await upstream.json();

  return NextResponse.json(
    data,
    {
      status:
        upstream.status,
    },
  );
}

export const GET = forward;
export const POST = forward;