import {
  apiFetch,
} from "@/lib/bff-api";

export const dynamic =
  "force-dynamic";

export async function GET(
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
      )}/payment`,
    );

  const responseBody =
    await upstream
      .arrayBuffer();

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

  return new Response(
    responseBody,
    {
      status:
        upstream.status,
      headers,
    },
  );
}
