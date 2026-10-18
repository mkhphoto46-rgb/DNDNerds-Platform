import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export type ExternalNotificationChannel = "TELEGRAM" | "BALE";
export const EXTERNAL_NOTIFICATION_CHANNELS = ["TELEGRAM", "BALE"] as const;
const pairPattern = /^[A-Za-z0-9_-]{43}$/;

export function newPairToken(): string {
  return randomBytes(32).toString("base64url");
}
export function hashPairToken(token: string): string {
  if (!pairPattern.test(token)) throw new Error("Invalid pairing token format");
  return createHash("sha256").update(token, "utf8").digest("hex");
}
export function secureCompare(candidate: unknown, expected: unknown): boolean {
  if (typeof candidate !== "string" || typeof expected !== "string" || expected.length < 24 || candidate.length > 256) return false;
  const a = createHash("sha256").update(candidate, "utf8").digest();
  const b = createHash("sha256").update(expected, "utf8").digest();
  return timingSafeEqual(a, b);
}
function destinationKey(): Buffer {
  const raw = process.env.NOTIFICATION_DESTINATION_KEY_HEX ?? "";
  if (!/^[0-9a-fA-F]{64}$/.test(raw)) throw new Error("NOTIFICATION_DESTINATION_KEY_HEX must contain exactly 64 hex characters");
  return Buffer.from(raw, "hex");
}
export function encryptPeerId(peerId: string): string {
  if (!/^[1-9][0-9]{0,19}$/.test(peerId)) throw new Error("Expected a private-chat numeric ID");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", destinationKey(), iv);
  const encrypted = Buffer.concat([cipher.update(peerId, "utf8"), cipher.final()]);
  return `v1:${iv.toString("base64url")}:${cipher.getAuthTag().toString("base64url")}:${encrypted.toString("base64url")}`;
}
export function decryptPeerId(serialized: string): string {
  const parts = serialized.split(":");
  if (parts.length !== 4 || parts[0] !== "v1") throw new Error("Unrecognized peer encryption format");
  const iv = Buffer.from(parts[1] ?? "", "base64url");
  const tag = Buffer.from(parts[2] ?? "", "base64url");
  if (iv.length !== 12 || tag.length !== 16) throw new Error("Invalid encrypted peer metadata");
  const decipher = createDecipheriv("aes-256-gcm", destinationKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(Buffer.from(parts[3] ?? "", "base64url")), decipher.final()]).toString("utf8");
}
export function fingerprintPeerId(channel: ExternalNotificationChannel, peerId: string): string {
  return createHmac("sha256", destinationKey()).update(`${channel}:${peerId}`).digest("hex");
}
export function verifiedTelegramPrivateStart(update: unknown): { token: string; peerId: string } | null {
  if (!update || typeof update !== "object") return null;
  const raw = update as { message?: { chat?: { id?: number; type?: string }; from?: { id?: number; is_bot?: boolean }; text?: string } };
  const m = raw.message;
  if (!m || m.chat?.type !== "private" || m.from?.is_bot === true) return null;
  if (!Number.isSafeInteger(m.chat.id) || !Number.isSafeInteger(m.from?.id) || m.chat.id !== m.from?.id) return null;
  if (typeof m.text !== "string") return null;
  const match = /^\/start ([A-Za-z0-9_-]{43})$/.exec(m.text);
  if (!match) return null;
  return { token: match[1]!, peerId: String(m.chat.id) };
}
