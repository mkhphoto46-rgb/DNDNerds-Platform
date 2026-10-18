import {
  NextResponse,
} from "next/server";

import {
  apiFetch,
} from "@/lib/bff-api";

export async function GET() {
  const upstream =
    await apiFetch(
      "/api/v1/auth/me",
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