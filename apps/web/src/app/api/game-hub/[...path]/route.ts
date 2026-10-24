import { NextResponse } from "next/server";
import { apiFetch } from "@/lib/bff-api";

async function forward(request: Request, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params;
  if (!path.length || path.some(part => !part || part === "." || part === "..")) {
    return NextResponse.json({ error: { message: "مسیر معتبر نیست." } }, { status: 400 });
  }
  const suffix = path.map(encodeURIComponent).join("/");
  const headers = new Headers();
  const type = request.headers.get("content-type");
  if (type) headers.set("Content-Type", type);
  const init: RequestInit = { method: request.method, headers };
  if (request.method !== "GET" && request.method !== "HEAD") init.body = await request.text();
  try {
    const upstream = await apiFetch(`/api/v1/game-hub/${suffix}${new URL(request.url).search}`, init);
    return NextResponse.json(await upstream.json(), { status: upstream.status });
  } catch {
    return NextResponse.json({ error: { message: "ارتباط با سرور برقرار نشد." } }, { status: 502 });
  }
}
export const GET = forward;
export const POST = forward;
export const PUT = forward;
