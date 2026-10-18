import {
  NextResponse,
} from "next/server";

import {
  apiFetch,
} from "@/lib/bff-api";

export async function GET() {
  const upstream =
    await apiFetch(
      "/api/v1/marketplace/orders",
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

export async function POST(
  request: Request,
) {
  const body =
    await request.text();

  const upstream =
    await apiFetch(
      "/api/v1/marketplace/orders",
      {
        method:
          "POST",

        headers: {
          "Content-Type":
            "application/json",
        },

        body,
      },
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