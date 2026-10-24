import { NextResponse } from "next/server";
import { apiFetch } from "@/lib/bff-api";

export async function PUT(request: Request) {
  const upstream = await apiFetch("/api/v1/auth/username", { method: "PUT", headers: { "Content-Type": "application/json" }, body: await request.text() });
  return NextResponse.json(await upstream.json(), { status: upstream.status });
}
