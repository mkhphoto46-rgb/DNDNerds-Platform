import type {
  FastifyInstance,
} from "fastify";

import {
  Algorithm,
  Version,
  hash,
} from "@node-rs/argon2";

import {
  and,
  eq,
  isNull,
} from "drizzle-orm";

import {
  z,
} from "zod";

import {
  requireAuthUser,
} from "../auth/session.js";

import {
  db,
} from "../db/client.js";

import {
  emailActionTokens,
  userSessions,
  users,
} from "../db/schema.js";

import {
  sendAccountEmail,
} from "../email/provider.js";

import {
  createEmailActionToken,
  findUsableActionToken,
} from "../email/tokens.js";

const emailSchema =
  z.object({
    email:
      z.string()
        .trim()
        .email()
        .max(254),
  });

const tokenSchema =
  z.object({
    token:
      z.string()
        .min(20)
        .max(300),
  });

const resetConfirmSchema =
  z.object({
    token:
      z.string()
        .min(20)
        .max(300),

    newPassword:
      z.string()
        .min(12)
        .max(128),
  });

const PASSWORD_POLICY = {
  algorithm:
    Algorithm.Argon2id,

  version:
    Version.V0x13,

  memoryCost:
    65_536,

  timeCost:
    3,

  parallelism:
    1,

  outputLen:
    32,
} as const;

function developmentToken(
  token: string,
) {
  if (
    process.env.NODE_ENV ===
    "production"
  ) {
    return {};
  }

  return {
    devToken:
      token,
  };
}

export async function registerAccountRoutes(
  app: FastifyInstance,
) {
  app.post(
    "/api/v1/account/email-verification/request",
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

      const [
        current,
      ] =
        await db
          .select({
            email:
              users.email,

            emailVerified:
              users.emailVerified,
          })
          .from(
            users,
          )
          .where(
            eq(
              users.id,
              user.id,
            ),
          )
          .limit(1);

      if (!current) {
        return reply
          .code(404)
          .send({
            error: {
              code:
                "USER_NOT_FOUND",

              message:
                "Account was not found.",
            },
          });
      }

      if (
        current.emailVerified
      ) {
        return {
          ok:
            true,

          alreadyVerified:
            true,
        };
      }

      const action =
        await createEmailActionToken(
          user.id,
          "VERIFY_EMAIL",
          60,
        );

      await sendAccountEmail({
        to:
          current.email,

        kind:
          "VERIFY_EMAIL",

        token:
          action.token,
      });

      return {
        ok:
          true,

        expiresAt:
          action.expiresAt,

        ...developmentToken(
          action.token,
        ),
      };
    },
  );

  app.post(
    "/api/v1/account/email-verification/confirm",
    async (
      request,
      reply,
    ) => {
      const parsed =
        tokenSchema.safeParse(
          request.body,
        );

      if (!parsed.success) {
        return reply
          .code(400)
          .send({
            error: {
              code:
                "VALIDATION_ERROR",

              message:
                "Verification token is invalid.",
            },
          });
      }

      const tokenRow =
        await findUsableActionToken(
          parsed.data.token,
          "VERIFY_EMAIL",
        );

      if (!tokenRow) {
        return reply
          .code(400)
          .send({
            error: {
              code:
                "INVALID_OR_EXPIRED_TOKEN",

              message:
                "Verification token is invalid or expired.",
            },
          });
      }

      await db.transaction(
        async (
          tx,
        ) => {
          await tx
            .update(
              users,
            )
            .set({
              emailVerified:
                true,

              updatedAt:
                new Date(),
            })
            .where(
              eq(
                users.id,
                tokenRow.userId,
              ),
            );

          await tx
            .update(
              emailActionTokens,
            )
            .set({
              usedAt:
                new Date(),
            })
            .where(
              eq(
                emailActionTokens.id,
                tokenRow.id,
              ),
            );
        },
      );

      return {
        ok:
          true,

        emailVerified:
          true,
      };
    },
  );

  app.post(
    "/api/v1/account/password-reset/request",
    async (
      request,
      reply,
    ) => {
      const parsed =
        emailSchema.safeParse(
          request.body,
        );

      if (!parsed.success) {
        return reply
          .code(200)
          .send({
            ok:
              true,
          });
      }

      const email =
        parsed.data.email
          .trim()
          .toLowerCase();

      const [
        user,
      ] =
        await db
          .select({
            id:
              users.id,

            email:
              users.email,

            status:
              users.status,
          })
          .from(
            users,
          )
          .where(
            eq(
              users.email,
              email,
            ),
          )
          .limit(1);

      if (
        !user ||
        user.status !==
          "ACTIVE"
      ) {
        return {
          ok:
            true,
        };
      }

      const action =
        await createEmailActionToken(
          user.id,
          "PASSWORD_RESET",
          30,
        );

      await sendAccountEmail({
        to:
          user.email,

        kind:
          "PASSWORD_RESET",

        token:
          action.token,
      });

      return {
        ok:
          true,

        ...(process.env.NODE_ENV ===
        "production"
          ? {}
          : {
              devToken:
                action.token,
            }),
      };
    },
  );

  app.post(
    "/api/v1/account/password-reset/confirm",
    async (
      request,
      reply,
    ) => {
      const parsed =
        resetConfirmSchema.safeParse(
          request.body,
        );

      if (!parsed.success) {
        return reply
          .code(400)
          .send({
            error: {
              code:
                "VALIDATION_ERROR",

              message:
                "Reset token or password is invalid.",
            },
          });
      }

      const tokenRow =
        await findUsableActionToken(
          parsed.data.token,
          "PASSWORD_RESET",
        );

      if (!tokenRow) {
        return reply
          .code(400)
          .send({
            error: {
              code:
                "INVALID_OR_EXPIRED_TOKEN",

              message:
                "Reset token is invalid or expired.",
            },
          });
      }

      const passwordHash =
        await hash(
          parsed.data.newPassword,
          PASSWORD_POLICY,
        );

      const now =
        new Date();

      await db.transaction(
        async (
          tx,
        ) => {
          await tx
            .update(
              users,
            )
            .set({
              passwordHash,

              updatedAt:
                now,
            })
            .where(
              eq(
                users.id,
                tokenRow.userId,
              ),
            );

          await tx
            .update(
              emailActionTokens,
            )
            .set({
              usedAt:
                now,
            })
            .where(
              eq(
                emailActionTokens.id,
                tokenRow.id,
              ),
            );

          await tx
            .update(
              userSessions,
            )
            .set({
              revokedAt:
                now,
            })
            .where(
              and(
                eq(
                  userSessions.userId,
                  tokenRow.userId,
                ),

                isNull(
                  userSessions.revokedAt,
                ),
              ),
            );
        },
      );

      return {
        ok:
          true,

        sessionsRevoked:
          true,
      };
    },
  );
}