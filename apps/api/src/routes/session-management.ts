import type {
  FastifyInstance,
} from "fastify";

import {
  and,
  desc,
  eq,
  isNull,
  ne,
} from "drizzle-orm";

import {
  z,
} from "zod";

import {
  requireAuthUser,
} from "../auth/session.js";

import {
  sessionTokenHash,
} from "../auth/session-device.js";

import {
  db,
} from "../db/client.js";

import {
  userSessionDevices,
  userSessions,
} from "../db/schema.js";

const sessionParams =
  z.object({
    sessionId:
      z.string()
        .uuid(),
  });

function bearerToken(
  authorization:
    string | undefined,
) {
  if (
    !authorization ||
    !authorization
      .startsWith(
        "Bearer ",
      )
  ) {
    return null;
  }

  return authorization
    .slice(
      "Bearer ".length,
    )
    .trim();
}

export async function registerSessionManagementRoutes(
  app: FastifyInstance,
) {
  app.get(
    "/api/v1/account/sessions",
    async (
      request,
      reply,
    ) => {
      const user =
        await requireAuthUser(
          request,
        );

      if (!user) {
        return reply
          .code(401)
          .send({
            error: {
              code:
                "UNAUTHORIZED",

              message:
                "Authentication required.",
            },
          });
      }

      const token =
        bearerToken(
          request.headers
            .authorization,
        );

      const currentHash =
        token
          ? sessionTokenHash(
              token,
            )
          : null;

      const rows =
        await db
          .select({
            id:
              userSessions.id,

            tokenHash:
              userSessions.tokenHash,

            expiresAt:
              userSessions.expiresAt,

            revokedAt:
              userSessions.revokedAt,

            createdAt:
              userSessions.createdAt,

            deviceLabel:
              userSessionDevices.deviceLabel,

            userAgent:
              userSessionDevices.userAgent,

            ipAddress:
              userSessionDevices.ipAddress,

            lastSeenAt:
              userSessionDevices.lastSeenAt,
          })
          .from(
            userSessions,
          )
          .leftJoin(
            userSessionDevices,
            eq(
              userSessionDevices.sessionId,
              userSessions.id,
            ),
          )
          .where(
            eq(
              userSessions.userId,
              user.id,
            ),
          )
          .orderBy(
            desc(
              userSessions.createdAt,
            ),
          );

      return {
        sessions:
          rows.map(
            (
              row,
            ) => ({
              id:
                row.id,

              expiresAt:
                row.expiresAt,

              revokedAt:
                row.revokedAt,

              createdAt:
                row.createdAt,

              deviceLabel:
                row.deviceLabel ??
                "Unknown device",

              userAgent:
                row.userAgent,

              ipAddress:
                row.ipAddress,

              lastSeenAt:
                row.lastSeenAt,

              current:
                currentHash !==
                  null &&
                row.tokenHash ===
                  currentHash,
            }),
          ),

        source:
          "postgresql" as const,
      };
    },
  );

  app.post(
    "/api/v1/account/sessions/:sessionId/revoke",
    async (
      request,
      reply,
    ) => {
      const user =
        await requireAuthUser(
          request,
        );

      const params =
        sessionParams.safeParse(
          request.params,
        );

      if (!user) {
        return reply
          .code(401)
          .send({
            error: {
              code:
                "UNAUTHORIZED",

              message:
                "Authentication required.",
            },
          });
      }

      if (!params.success) {
        return reply
          .code(400)
          .send({
            error: {
              code:
                "VALIDATION_ERROR",

              message:
                "Invalid session id.",
            },
          });
      }

      const changed =
        await db
          .update(
            userSessions,
          )
          .set({
            revokedAt:
              new Date(),
          })
          .where(
            and(
              eq(
                userSessions.id,
                params.data.sessionId,
              ),

              eq(
                userSessions.userId,
                user.id,
              ),

              isNull(
                userSessions.revokedAt,
              ),
            ),
          )
          .returning({
            id:
              userSessions.id,
          });

      if (
        changed.length !==
        1
      ) {
        return reply
          .code(404)
          .send({
            error: {
              code:
                "SESSION_NOT_FOUND",

              message:
                "Active session was not found.",
            },
          });
      }

      return {
        ok:
          true,

        revokedSessionId:
          params.data.sessionId,
      };
    },
  );

  app.post(
    "/api/v1/account/sessions/revoke-others",
    async (
      request,
      reply,
    ) => {
      const user =
        await requireAuthUser(
          request,
        );

      if (!user) {
        return reply
          .code(401)
          .send({
            error: {
              code:
                "UNAUTHORIZED",

              message:
                "Authentication required.",
            },
          });
      }

      const token =
        bearerToken(
          request.headers
            .authorization,
        );

      if (!token) {
        return reply
          .code(400)
          .send({
            error: {
              code:
                "CURRENT_SESSION_UNKNOWN",

              message:
                "Current session token could not be identified.",
            },
          });
      }

      const currentHash =
        sessionTokenHash(
          token,
        );

      const changed =
        await db
          .update(
            userSessions,
          )
          .set({
            revokedAt:
              new Date(),
          })
          .where(
            and(
              eq(
                userSessions.userId,
                user.id,
              ),

              isNull(
                userSessions.revokedAt,
              ),

              ne(
                userSessions.tokenHash,
                currentHash,
              ),
            ),
          )
          .returning({
            id:
              userSessions.id,
          });

      return {
        ok:
          true,

        revokedCount:
          changed.length,
      };
    },
  );
}