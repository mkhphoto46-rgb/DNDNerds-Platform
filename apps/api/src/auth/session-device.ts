import type {
  FastifyRequest,
} from "fastify";

import {
  createHash,
} from "node:crypto";

import {
  eq,
} from "drizzle-orm";

import {
  db,
} from "../db/client.js";

import {
  userSessionDevices,
  userSessions,
} from "../db/schema.js";

export function sessionTokenHash(
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

function labelFromUserAgent(
  value:
    string | undefined,
) {
  if (!value) {
    return "Unknown device";
  }

  if (
    /android/i.test(
      value,
    )
  ) {
    return "Android device";
  }

  if (
    /iphone|ipad/i.test(
      value,
    )
  ) {
    return "Apple mobile device";
  }

  if (
    /windows/i.test(
      value,
    )
  ) {
    return "Windows device";
  }

  if (
    /mac os|macintosh/i.test(
      value,
    )
  ) {
    return "Mac device";
  }

  if (
    /linux/i.test(
      value,
    )
  ) {
    return "Linux device";
  }

  return "Browser session";
}

export async function recordIssuedSession(
  token: string,
  request: FastifyRequest,
) {
  const tokenHash =
    sessionTokenHash(
      token,
    );

  const [
    session,
  ] =
    await db
      .select({
        id:
          userSessions.id,
      })
      .from(
        userSessions,
      )
      .where(
        eq(
          userSessions.tokenHash,
          tokenHash,
        ),
      )
      .limit(1);

  if (!session) {
    throw new Error(
      "Issued session could not be located for device tracking.",
    );
  }

  const userAgent =
    request.headers[
      "user-agent"
    ]?.slice(
      0,
      500,
    );

  await db
    .insert(
      userSessionDevices,
    )
    .values({
      sessionId:
        session.id,

      userAgent:
        userAgent ??
        null,

      ipAddress:
        request.ip
          .slice(
            0,
            80,
          ),

      deviceLabel:
        labelFromUserAgent(
          userAgent,
        ),

      lastSeenAt:
        new Date(),
    })
    .onConflictDoUpdate({
      target:
        userSessionDevices.sessionId,

      set: {
        userAgent:
          userAgent ??
          null,

        ipAddress:
          request.ip
            .slice(
              0,
              80,
            ),

        deviceLabel:
          labelFromUserAgent(
            userAgent,
          ),

        lastSeenAt:
          new Date(),
      },
    });
}