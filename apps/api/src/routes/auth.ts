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
  eq,
} from "drizzle-orm";

import {
  z,
} from "zod";

import {
  db,
} from "../db/client.js";

import {
  userTotpMfa,
  users,
} from "../db/schema.js";

import {
  issueSession,
  requireAuthUser,
  revokeRequestSession,
} from "../auth/session.js";

import {
  recordIssuedSession,
} from "../auth/session-device.js";

import {
  verifyEncryptedTotp,
} from "../security/totp.js";

const credentialsSchema =
  z.object({
    email:
      z.string()
        .trim()
        .email()
        .max(254),

    password:
      z.string()
        .min(12)
        .max(128),

    totpCode:
      z.string()
        .regex(
          /^\d{6}$/,
        )
        .optional(),
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

function normalizeEmail(
  value: string,
) {
  return value
    .trim()
    .toLowerCase();
}

export function isPostgresUniqueViolation(
  error: unknown,
) {
  let current:
    unknown =
    error;

  for (
    let depth = 0;
    depth < 6;
    depth += 1
  ) {
    if (
      typeof current !==
        "object" ||
      current ===
        null
    ) {
      return false;
    }

    const record =
      current as {
        code?: unknown;
        cause?: unknown;
      };

    if (
      record.code ===
      "23505"
    ) {
      return true;
    }

    current =
      record.cause;
  }

  return false;
}

function publicUser(
  user: {
    id: string;
    email: string;
    emailVerified: boolean;
  },
) {
  return {
    id:
      user.id,

    email:
      user.email,

    emailVerified:
      user.emailVerified,
  };
}

export async function registerAuthRoutes(
  app: FastifyInstance,
) {
  app.post(
    "/api/v1/auth/register",
    async (
      request,
      reply,
    ) => {
      const parsed =
        credentialsSchema
          .omit({
            totpCode:
              true,
          })
          .safeParse(
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
                "Email or password is invalid.",

              issues:
                parsed.error.issues,
            },
          });
      }

      const email =
        normalizeEmail(
          parsed.data.email,
        );

      const [
        existing,
      ] =
        await db
          .select({
            id:
              users.id,
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

      if (existing) {
        return reply
          .code(409)
          .send({
            error: {
              code:
                "EMAIL_ALREADY_EXISTS",

              message:
                "An account already exists for this email.",
            },
          });
      }

      const passwordHash =
        await hash(
          parsed.data.password,
          PASSWORD_POLICY,
        );

      let created:
        | {
            id: string;
            email: string;
            emailVerified: boolean;
          }
        | undefined;

      try {
        [
          created,
        ] =
          await db
            .insert(
              users,
            )
            .values({
              email,

              passwordHash,

              status:
                "ACTIVE",

              emailVerified:
                false,
            })
            .returning({
              id:
                users.id,

              email:
                users.email,

              emailVerified:
                users.emailVerified,
            });
      }
      catch (error) {
        if (
          isPostgresUniqueViolation(
            error,
          )
        ) {
          return reply
            .code(409)
            .send({
              error: {
                code:
                  "EMAIL_ALREADY_EXISTS",

                message:
                  "An account already exists for this email.",
              },
            });
        }

        throw error;
      }

      if (!created) {
        throw new Error(
          "User creation failed.",
        );
      }

      const session =
        await issueSession(
          created.id,
        );

      await recordIssuedSession(
        session.token,
        request,
      );

      return reply
        .code(201)
        .send({
          user:
            publicUser(
              created,
            ),

          sessionToken:
            session.token,

          sessionExpiresAt:
            session.expiresAt,

          source:
            "postgresql",
        });
    },
  );

  app.post(
    "/api/v1/auth/login",
    async (
      request,
      reply,
    ) => {
      const parsed =
        credentialsSchema
          .safeParse(
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
                "Email or password is invalid.",
            },
          });
      }

      const email =
        normalizeEmail(
          parsed.data.email,
        );

      const [
        user,
      ] =
        await db
          .select({
            id:
              users.id,

            email:
              users.email,

            passwordHash:
              users.passwordHash,

            status:
              users.status,

            emailVerified:
              users.emailVerified,
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
        !user.passwordHash ||
        user.status !==
          "ACTIVE"
      ) {
        return reply
          .code(401)
          .send({
            error: {
              code:
                "INVALID_CREDENTIALS",

              message:
                "Invalid email or password.",
            },
          });
      }

      let passwordValid =
        false;

      try {
        passwordValid =
          await verify(
            user.passwordHash,
            parsed.data.password,
          );
      }
      catch {
        passwordValid =
          false;
      }

      if (!passwordValid) {
        return reply
          .code(401)
          .send({
            error: {
              code:
                "INVALID_CREDENTIALS",

              message:
                "Invalid email or password.",
            },
          });
      }

      const [
        mfa,
      ] =
        await db
          .select()
          .from(
            userTotpMfa,
          )
          .where(
            eq(
              userTotpMfa.userId,
              user.id,
            ),
          )
          .limit(1);

      if (
        mfa?.enabled
      ) {
        if (
          !parsed.data.totpCode ||
          !verifyEncryptedTotp(
            mfa.encryptedSecret,
            parsed.data.totpCode,
          )
        ) {
          return reply
            .code(401)
            .send({
              error: {
                code:
                  "MFA_REQUIRED",

                message:
                  "A valid six-digit TOTP code is required.",
              },
            });
        }
      }

      const session =
        await issueSession(
          user.id,
        );

      await recordIssuedSession(
        session.token,
        request,
      );

      return reply
        .code(200)
        .send({
          user:
            publicUser(
              user,
            ),

          sessionToken:
            session.token,

          sessionExpiresAt:
            session.expiresAt,

          mfa:
            mfa?.enabled ??
            false,

          source:
            "postgresql",
        });
    },
  );

  app.get(
    "/api/v1/auth/me",
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

      return {
        user,

        source:
          "postgresql" as const,
      };
    },
  );

  app.post(
    "/api/v1/auth/logout",
    async (
      request,
      reply,
    ) => {
      await revokeRequestSession(
        request,
      );

      return reply
        .code(200)
        .send({
          ok:
            true,
        });
    },
  );
}
