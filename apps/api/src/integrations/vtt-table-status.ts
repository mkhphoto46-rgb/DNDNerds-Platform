import { createHmac } from "node:crypto";

export type GameSession = { id: string; number: number; startedAt: string; endedAt: string | null };
export type VttTableStatus = { tableId: string; onlineCount: number; activeSession: GameSession | null; recentSessions: GameSession[] };

export function tableStatusSignature(secret: string, timestamp: string, tableIds: string[]): string {
  return createHmac("sha256", secret).update(`${timestamp}:${tableIds.join(",")}`).digest("hex");
}

export async function fetchVttTableStatuses(tableIds: string[]): Promise<Record<string, VttTableStatus> | null> {
  if (!tableIds.length) return {};
  const secret = process.env.VTT_BRIDGE_SECRET?.trim();
  if (!secret || secret.length < 32) return null;
  const origin = new URL(process.env.VTT_INTERNAL_URL ?? "http://127.0.0.1:4200");
  if (origin.protocol !== "http:" || !["127.0.0.1", "localhost"].includes(origin.hostname)) return null;
  const ids = [...new Set(tableIds)].slice(0, 80);
  const timestamp = String(Date.now());
  try {
    const response = await fetch(new URL("/api/platform/table-status", origin), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Platform-Timestamp": timestamp,
        "X-Platform-Signature": tableStatusSignature(secret, timestamp, ids),
      },
      body: JSON.stringify({ tableIds: ids }),
      signal: AbortSignal.timeout(2500),
    });
    if (!response.ok) return null;
    const body = await response.json() as { data?: VttTableStatus[] };
    if (!Array.isArray(body.data)) return null;
    return Object.fromEntries(body.data.filter(row => ids.includes(row.tableId)).map(row => [row.tableId, row]));
  } catch { return null; }
}
