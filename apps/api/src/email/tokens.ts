import {
  createHash,
  randomBytes,
} from "node:crypto";

import {
  and,
  eq,
  gt,
  isNull,
} from "drizzle-orm";

import {
  db,
} from "../db/client.js";

import {
  emailActionTokens,
} from "../db/schema.js";

export type EmailActionType =
  | "VERIFY_EMAIL"
  | "PASSWORD_RESET";

export function hashActionToken(
  token: string,
) {
  return createHash(
    "sha256",
  )
    .update(
      token,
      "utf8",
    )
    .digest(
      "hex",
    );
}

export async function createEmailActionToken(
  userId: string,
  type: EmailActionType,
  lifetimeMinutes: number,
) {
  const now =
    new Date();

  await db
    .update(
      emailActionTokens,
    )
    .set({
      usedAt:
        now,
    })
    .where(
      and(
        eq(
          emailActionTokens.userId,
          userId,
        ),

        eq(
          emailActionTokens.type,
          type,
        ),

        isNull(
          emailActionTokens.usedAt,
        ),
      ),
    );

  const token =
    randomBytes(32)
      .toString(
        "base64url",
      );

  const expiresAt =
    new Date(
      now.getTime() +
      lifetimeMinutes *
        60_000,
    );

  await db
    .insert(
      emailActionTokens,
    )
    .values({
      userId,

      type,

      tokenHash:
        hashActionToken(
          token,
        ),

      expiresAt,
    });

  return {
    token,
    expiresAt,
  };
}

export async function findUsableActionToken(
  token: string,
  type: EmailActionType,
) {
  const now =
    new Date();

  const [
    row,
  ] =
    await db
      .select()
      .from(
        emailActionTokens,
      )
      .where(
        and(
          eq(
            emailActionTokens.tokenHash,
            hashActionToken(
              token,
            ),
          ),

          eq(
            emailActionTokens.type,
            type,
          ),

          isNull(
            emailActionTokens.usedAt,
          ),

          gt(
            emailActionTokens.expiresAt,
            now,
          ),
        ),
      )
      .limit(1);

  return (
    row ??
    null
  );
}