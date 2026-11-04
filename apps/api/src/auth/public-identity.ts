import { createHash } from "node:crypto";
import { z } from "zod";

export const usernameSchema = z.string().trim().min(3).max(24).regex(/^[a-zA-Z][a-zA-Z0-9_]*$/);

export function normalizeUsername(value: string): string {
  return value.trim();
}

// A compact display reference. Database relations continue using the full UUID.
export function publicAccountId(userId: string): string {
  return createHash("sha256").update(userId).digest().subarray(0, 9).toString("base64url");
}
