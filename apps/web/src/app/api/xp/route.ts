import { NextResponse } from "next/server";
import { apiFetch } from "@/lib/bff-api";

export async function GET() {
  try {
    const upstream = await apiFetch("/api/v1/xp");
    return NextResponse.json(await upstream.json(), { status: upstream.status });
  } catch {
    return NextResponse.json({ error: { message: "ارتباط با سرور برقرار نشد." } }, { status: 502 });
  }
}
