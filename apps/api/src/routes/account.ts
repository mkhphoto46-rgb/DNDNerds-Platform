import type {
  FastifyInstance,
} from "fastify";

import {
  Algorithm,
  Version,
  hash,
  verify,
} from "@node-rs/argon2";

import {
  and,
  eq,
  gt,
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
import { accountEmailReady, statusAfterVerification } from "../email/account-email-policy.js";

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
        .min(8)
        .max(128),
  });

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(128),
  newPassword: z.string().min(8).max(128),
});

function emailUnavailable(reply: import("fastify").FastifyReply) {
  return reply.code(503).send({ error: {
    code: "EMAIL_SERVICE_UNAVAILABLE",
    message: "Email sending is not configured yet.",
  } });
}

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

export async function registerAccountRoutes(
  app: FastifyInstance,
) {
  app.post("/api/v1/account/password/change", async (request, reply) => {
    const user = await requireAuthUser(request);
    if (!user) return reply.code(401).send({ error: { code: "UNAUTHORIZED", message: "Authentication required." } });
    const parsed = changePasswordSchema.safeParse(request.body);
    if (!parsed.success || parsed.data.currentPassword === parsed.data.newPassword) {
      return reply.code(400).send({ error: { code: "VALIDATION_ERROR", message: "Choose a different password with at least 8 characters." } });
    }
    const [current] = await db.select({ passwordHash: users.passwordHash })
      .from(users).where(eq(users.id, user.id)).limit(1);
    if (!current?.passwordHash || !await verify(current.passwordHash, parsed.data.currentPassword)) {
      return reply.code(401).send({ error: { code: "INVALID_CREDENTIALS", message: "Current password is incorrect." } });
    }
    const passwordHash = await hash(parsed.data.newPassword, PASSWORD_POLICY);
    const now = new Date();
    await db.transaction(async (tx) => {
      await tx.update(users).set({ passwordHash, updatedAt: now }).where(eq(users.id, user.id));
      await tx.update(userSessions).set({ revokedAt: now })
        .where(and(eq(userSessions.userId, user.id), isNull(userSessions.revokedAt)));
    });
    return { ok: true, sessionsRevoked: true };
  });

  app.post(
    "/api/v1/account/email-verification/request",
    { config: { rateLimit: { max: 5, timeWindow: "15 minutes" } } },
    async (
      request,
      reply,
    ) => {
      if (!accountEmailReady()) return emailUnavailable(reply);
      const parsedEmail = emailSchema.safeParse(request.body);
      const user =
        await requireAuthUser(
          request,
        );

      if (!user && !parsedEmail.success) {
        return reply
          .code(400)
          .send({
            error: {
              code:
                "VALIDATION_ERROR",

              message:
                "A valid email address is required.",
            },
          });
      }

      const [
        current,
      ] =
        await db
          .select({
            id: users.id,
            email:
              users.email,

            emailVerified:
              users.emailVerified,
          })
          .from(
            users,
          )
          .where(
            user ? eq(users.id, user.id) : eq(users.email, parsedEmail.success ? parsedEmail.data.email.trim().toLowerCase() : ""),
          )
          .limit(1);

      if (!current || current.emailVerified) return { ok: true };

      const [recent] = await db.select({ id: emailActionTokens.id })
        .from(emailActionTokens)
        .where(and(
          eq(emailActionTokens.userId, current.id),
          eq(emailActionTokens.type, "VERIFY_EMAIL"),
          isNull(emailActionTokens.usedAt),
          gt(emailActionTokens.createdAt, new Date(Date.now() - 60_000)),
        )).limit(1);
      if (recent) return { ok: true };

      const action =
        await createEmailActionToken(
          current.id,
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

      const confirmed = await db.transaction(
        async (
          tx,
        ) => {
          const now = new Date();
          const [consumed] = await tx.update(emailActionTokens)
            .set({ usedAt: now })
            .where(and(
              eq(emailActionTokens.id, tokenRow.id),
              isNull(emailActionTokens.usedAt),
              gt(emailActionTokens.expiresAt, now),
            ))
            .returning({ userId: emailActionTokens.userId });
          if (!consumed) return false;

          const [current] = await tx.select({ status: users.status })
            .from(users).where(eq(users.id, consumed.userId)).limit(1);
          if (!current) return false;
          await tx
            .update(
              users,
            )
            .set({
              emailVerified:
                true,
              status: statusAfterVerification(current.status) as typeof current.status,
              updatedAt: now,
            })
            .where(
              eq(
                users.id,
                consumed.userId,
              ),
            );
          return true;
        },
      );

      if (!confirmed) return reply.code(400).send({ error: {
        code: "INVALID_OR_EXPIRED_TOKEN",
        message: "Verification token is invalid or expired.",
      } });

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
    { config: { rateLimit: { max: 5, timeWindow: "15 minutes" } } },
    async (
      request,
      reply,
    ) => {
      if (!accountEmailReady()) return emailUnavailable(reply);
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

      if (!user || user.status === "BANNED" || user.status === "SUSPENDED") {
        return {
          ok:
            true,
        };
      }

      const [recent] = await db.select({ id: emailActionTokens.id })
        .from(emailActionTokens)
        .where(and(
          eq(emailActionTokens.userId, user.id),
          eq(emailActionTokens.type, "PASSWORD_RESET"),
          isNull(emailActionTokens.usedAt),
          gt(emailActionTokens.createdAt, new Date(Date.now() - 60_000)),
        )).limit(1);
      if (recent) return { ok: true };

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

      const changed = await db.transaction(
        async (
          tx,
        ) => {
          const [consumed] = await tx.update(emailActionTokens)
            .set({ usedAt: now })
            .where(and(
              eq(emailActionTokens.id, tokenRow.id),
              isNull(emailActionTokens.usedAt),
              gt(emailActionTokens.expiresAt, now),
            ))
            .returning({ userId: emailActionTokens.userId });
          if (!consumed) return false;
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
                consumed.userId,
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
                  consumed.userId,
                ),

                isNull(
                  userSessions.revokedAt,
                ),
              ),
            );
          return true;
        },
      );

      if (!changed) return reply.code(400).send({ error: {
        code: "INVALID_OR_EXPIRED_TOKEN",
        message: "Reset token is invalid or expired.",
      } });

      return {
        ok:
          true,

        sessionsRevoked:
          true,
      };
    },
  );
}
