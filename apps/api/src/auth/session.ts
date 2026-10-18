import {
  createHash,
  randomBytes,
} from "node:crypto";

import type {
  FastifyRequest,
} from "fastify";

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
  userSessions,
  users,
} from "../db/schema.js";

export type AuthUser = {
  id: string;
  email: string;
};

const SESSION_DAYS =
  30;

function tokenHash(
  token: string,
) {
  return createHash(
    "sha256",
  )
    .update(token)
    .digest("hex");
}

export function getBearerToken(
  request: FastifyRequest,
) {
  const value =
    request.headers
      .authorization;

  if (!value) {
    return null;
  }

  const [
    kind,
    token,
  ] =
    value.split(" ");

  if (
    kind?.toLowerCase() !==
      "bearer" ||
    !token
  ) {
    return null;
  }

  return token;
}

export async function issueSession(
  userId: string,
) {
  const token =
    randomBytes(32)
      .toString("base64url");

  const expiresAt =
    new Date(
      Date.now() +
      SESSION_DAYS *
        24 *
        60 *
        60 *
        1000,
    );

  await db
    .insert(userSessions)
    .values({
      userId,

      tokenHash:
        tokenHash(token),

      expiresAt,

      lastSeenAt:
        new Date(),
    });

  return {
    token,
    expiresAt,
  };
}

export async function requireAuthUser(
  request: FastifyRequest,
): Promise<AuthUser | null> {
  const token =
    getBearerToken(
      request,
    );

  if (!token) {
    return null;
  }

  const now =
    new Date();

  const [
    row,
  ] =
    await db
      .select({
        sessionId:
          userSessions.id,

        userId:
          users.id,

        email:
          users.email,
      })
      .from(
        userSessions,
      )
      .innerJoin(
        users,
        eq(
          users.id,
          userSessions.userId,
        ),
      )
      .where(
        and(
          eq(
            userSessions.tokenHash,
            tokenHash(token),
          ),

          isNull(
            userSessions.revokedAt,
          ),

          gt(
            userSessions.expiresAt,
            now,
          ),

          eq(
            users.status,
            "ACTIVE",
          ),
        ),
      )
      .limit(1);

  if (!row) {
    return null;
  }

  await db
    .update(userSessions)
    .set({
      lastSeenAt:
        now,
    })
    .where(
      eq(
        userSessions.id,
        row.sessionId,
      ),
    );

  return {
    id:
      row.userId,

    email:
      row.email,
  };
}

export async function revokeRequestSession(
  request: FastifyRequest,
) {
  const token =
    getBearerToken(
      request,
    );

  if (!token) {
    return;
  }

  await db
    .update(userSessions)
    .set({
      revokedAt:
        new Date(),
    })
    .where(
      and(
        eq(
          userSessions.tokenHash,
          tokenHash(token),
        ),

        isNull(
          userSessions.revokedAt,
        ),
      ),
    );
}