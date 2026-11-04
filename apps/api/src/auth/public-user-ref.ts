import { sql } from "drizzle-orm";
import { z } from "zod";

import { db } from "../db/client.js";

const uuid = z.string().uuid();
const PUBLIC_ID = /^[A-Za-z0-9_-]{12}$/;

/**
 * B40: public pages are addressed by the public ID (see publicAccountId). Old links
 * with the account UUID keep working. Returns the account UUID, or null.
 */
export async function resolveUserRef(ref: string): Promise<string | null> {
  if (uuid.safeParse(ref).success) return ref.toLowerCase();
  if (!PUBLIC_ID.test(ref)) return null;
  // Same derivation as publicAccountId: first 9 bytes of sha256(uuid text), base64url.
  const rows = await db.execute<{ id: string }>(sql`select id from users where translate(rtrim(encode(substring(sha256(convert_to(id::text, 'UTF8')) from 1 for 9), 'base64'), '='), '+/', '-_') = ${ref} limit 2`);
  return rows.length === 1 ? rows[0]!.id : null;
}
