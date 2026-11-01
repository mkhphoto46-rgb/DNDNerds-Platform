import { createHmac } from "node:crypto";
import { resolveVttOrigin } from "./vtt-origin.js";

export async function requestNativeVttInvite(
  input: { code: string; userId: string; username: string }, secret: string,
  origin = process.env.VTT_INTERNAL_URL, request: typeof fetch = fetch,
): Promise<{ status: number; ticket?: string; tableId?: string }> {
  const target = resolveVttOrigin(origin);
  if (!target || secret.length < 32) return { status: 503 };
  const timestamp = String(Date.now()), body = JSON.stringify(input);
  try {
    const response = await request(new URL("/api/platform/invite", target), {
      method: "POST", headers: {
        "Content-Type": "application/json", "X-Platform-Timestamp": timestamp,
        "X-Platform-Signature": createHmac("sha256", secret).update(`${timestamp}:${body}`).digest("hex"),
      }, body, signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) return { status: [404, 409, 429].includes(response.status) ? response.status : 503 };
    const value = await response.json() as { data?: { ticket?: unknown; tableId?: unknown } };
    const ticket = value.data?.ticket;
    const tableId = value.data?.tableId;
    if (tableId != null && (typeof tableId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(tableId))) return { status: 503 };
    return typeof ticket === "string" && ticket.length <= 2048 && /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(ticket)
      ? { status: 200, ticket, ...(typeof tableId === "string" ? { tableId } : {}) } : { status: 503 };
  } catch { return { status: 503 }; }
}
