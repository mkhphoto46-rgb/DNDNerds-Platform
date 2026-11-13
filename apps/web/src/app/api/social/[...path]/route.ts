import { NextResponse } from "next/server";
import { apiFetch } from "@/lib/bff-api";

async function forward(request: Request, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params;
  if (path.length === 0 || path.some(segment => !segment || segment === "." || segment === "..")) {
    return NextResponse.json({ error: { code: "INVALID_PATH", message: "Invalid social route." } }, { status: 400 });
  }
  const suffix = path.map(encodeURIComponent).join("/");
  const query = new URL(request.url).search;
  const headers = new Headers();
  const contentType = request.headers.get("content-type");
  if (contentType) headers.set("Content-Type", contentType);
  const validator = request.headers.get("if-none-match");
  if (validator && request.method === "GET") headers.set("If-None-Match", validator);
  const init: RequestInit = { method: request.method, headers };
  if (request.method !== "GET" && request.method !== "HEAD") init.body = await request.text();
  const upstream = await apiFetch(`/api/v1/social/${suffix}${query}`, init);
  const responseHeaders = new Headers({ "Cache-Control": "private, no-store" });
  const etag = upstream.headers.get("etag");
  if (etag) responseHeaders.set("ETag", etag);
  if (upstream.status === 304) return new Response(null, { status: 304, headers: responseHeaders });
  return NextResponse.json(await upstream.json(), { status: upstream.status, headers: responseHeaders });
}
export const GET = forward;
export const POST = forward;
