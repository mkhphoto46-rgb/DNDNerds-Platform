import { createHmac } from "node:crypto";
import { resolveVttOrigin } from "./vtt-origin.js";

/** Only the private, allowlisted VTT can receive an owner deletion signature. */
export async function requestVttTableDeletion(
  input: { tableId: string; hostUserId: string }, secret: string,
  origin = process.env.VTT_INTERNAL_URL, request: typeof fetch = fetch,
): Promise<boolean> {
  const target = resolveVttOrigin(origin);
  if (!target || secret.length < 32) return false;
  const timestamp = String(Date.now());
  const signature = createHmac("sha256", secret).update(`${timestamp}:delete:${JSON.stringify(input)}`).digest("hex");
  try {
    const response = await request(new URL("/api/platform/delete-table", target), {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...input, timestamp, signature }), signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) return false;
    const result = await response.json() as { data?: { deleted?: unknown } };
    return result.data?.deleted === true;
  } catch { return false; }
}
