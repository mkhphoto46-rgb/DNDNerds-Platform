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
  lte,
} from "drizzle-orm";

import {
  db,
} from "../db/client.js";

import {
  userSessions,
  users,
} from "../db/schema.js";
import { publicAccountId } from "./public-identity.js";

export type AuthUser = {
  id: string;
  email: string;
  username: string | null;
  publicId: string;
};

const sessionMfa = new WeakMap<FastifyRequest, Date | null>();

export function verifiedSessionMfa(request: FastifyRequest) {
  return sessionMfa.get(request) ?? null;
}

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
  mfaVerifiedAt: Date | null = null,
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
      mfaVerifiedAt,

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
        mfaVerifiedAt: userSessions.mfaVerifiedAt,
        lastSeenAt: userSessions.lastSeenAt,
        sessionId:
          userSessions.id,

        userId:
          users.id,

        email:
          users.email,

        username:
          users.username,
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

  sessionMfa.set(request, row.mfaVerifiedAt);
  const cutoff = new Date(now.getTime() - 60_000);
  if (row.lastSeenAt <= cutoff) {
    await db.update(userSessions).set({ lastSeenAt: now }).where(and(
      eq(userSessions.id, row.sessionId),
      isNull(userSessions.revokedAt),
      lte(userSessions.lastSeenAt, cutoff),
    ));
  }

  return {
    id:
      row.userId,

    email:
      row.email,

    username:
      row.username,

    publicId:
      publicAccountId(row.userId),
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
