import { createHmac, timingSafeEqual } from "node:crypto";

export type VttLaunch = {
  tableId: string;
  userId: string;
  hostUserId: string;
  title: string;
  username: string;
  role: "dm" | "player";
};

export type VttTicketPayload = VttLaunch & { expiresAt: number };

export function createVttTicket(payload: VttLaunch, secret: string, now = Date.now()): string {
  if (secret.length < 32) throw new Error("VTT_BRIDGE_SECRET must be at least 32 characters");
  const body = Buffer.from(JSON.stringify({ ...payload, expiresAt: now + 60_000 })).toString("base64url");
  const signature = createHmac("sha256", secret).update(body).digest("base64url");
  return `${body}.${signature}`;
}

export function verifyVttTicket(ticket: string, secret: string, now = Date.now()): VttTicketPayload | null {
  if (secret.length < 32 || ticket.length > 2048) return null;
  const parts = ticket.split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
  const actual = Buffer.from(parts[1], "base64url");
  const expected = createHmac("sha256", secret).update(parts[0]).digest();
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
  try {
    const data = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8")) as VttTicketPayload;
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuid.test(data.tableId) || !uuid.test(data.userId) || !uuid.test(data.hostUserId)) return null;
    if ((data.role !== "dm" && data.role !== "player") || (data.role === "dm" && data.userId !== data.hostUserId)) return null;
    if (typeof data.title !== "string" || !data.title.trim() || data.title.length > 120) return null;
    if (typeof data.username !== "string" || !/^[a-z][a-z0-9_]{2,23}$/i.test(data.username)) return null;
    if (!Number.isFinite(data.expiresAt) || data.expiresAt <= now || data.expiresAt > now + 60_000) return null;
    return data;
  } catch { return null; }
}
