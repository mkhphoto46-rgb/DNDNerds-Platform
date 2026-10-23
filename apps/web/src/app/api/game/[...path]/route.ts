import { NextResponse } from "next/server";
import { apiFetch } from "@/lib/bff-api";

// Game tables (roadmap phase 10): the browser reaches only these API areas.
const ALLOWED_PREFIXES = ["tables", "profile/display-name", "vtt-instances"];

async function forward(request: Request, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params;
  if (path.length === 0 || path.some(segment => !segment || segment === "." || segment === "..")) {
    return NextResponse.json({ error: { code: "INVALID_PATH", message: "Invalid game route." } }, { status: 400 });
  }
  const joined = path.join("/");
  if (!ALLOWED_PREFIXES.some(prefix => joined === prefix || joined.startsWith(`${prefix}/`))) {
    return NextResponse.json({ error: { code: "INVALID_PATH", message: "Invalid game route." } }, { status: 404 });
  }
  const suffix = path.map(encodeURIComponent).join("/");
  const headers = new Headers();
  const contentType = request.headers.get("content-type");
  if (contentType) headers.set("Content-Type", contentType);
  const init: RequestInit = { method: request.method, headers };
  if (request.method !== "GET" && request.method !== "HEAD") init.body = await request.text();
  const upstream = await apiFetch(`/api/v1/${suffix}`, init);
  const data = await upstream.json().catch(() => ({}));
  return NextResponse.json(data, { status: upstream.status });
}
export const GET = forward;
export const POST = forward;
export const PUT = forward;
export const PATCH = forward;
export const DELETE = forward;
