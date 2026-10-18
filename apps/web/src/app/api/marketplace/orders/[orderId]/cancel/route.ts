import {
  NextResponse,
} from "next/server";

import {
  apiFetch,
} from "@/lib/bff-api";

export async function POST(
  _request: Request,
  context: {
    params:
      Promise<{
        orderId: string;
      }>;
  },
) {
  const {
    orderId,
  } =
    await context.params;

  const upstream =
    await apiFetch(
      `/api/v1/marketplace/orders/${encodeURIComponent(
        orderId,
      )}/cancel`,
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