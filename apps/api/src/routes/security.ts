import type {
  FastifyInstance,
} from "fastify";

import {
  verify,
} from "@node-rs/argon2";

import {
  eq,
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
  userTotpMfa,
  users,
} from "../db/schema.js";

import {
  buildOtpAuthUri,
  encryptTotpSecret,
  generateTotpSecret,
  verifyEncryptedTotp,
} from "../security/totp.js";

const passwordBody =
  z.object({
    password:
      z.string()
        .min(8)
        .max(128),
  });

const confirmBody =
  z.object({
    code:
      z.string()
        .regex(
          /^\d{6}$/,
        ),
  });

const disableBody =
  z.object({
    password:
      z.string()
        .min(8)
        .max(128),

    code:
      z.string()
        .regex(
          /^\d{6}$/,
        ),
  });

async function verifyPassword(
  userId: string,
  password: string,
) {
  const [
    row,
  ] =
    await db
      .select({
        passwordHash:
          users.passwordHash,
      })
      .from(
        users,
      )
      .where(
        eq(
          users.id,
          userId,
        ),
      )
      .limit(1);

  if (
    !row?.passwordHash
  ) {
    return false;
  }

  try {
    return await verify(
      row.passwordHash,
      password,
    );
  }
  catch {
    return false;
  }
}

export async function registerSecurityRoutes(
  app: FastifyInstance,
) {
  app.get(
    "/api/v1/security/mfa/status",
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
        row,
      ] =
        await db
          .select({
            enabled:
              userTotpMfa.enabled,

            confirmedAt:
              userTotpMfa.confirmedAt,
          })
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

      return {
        enabled:
          row?.enabled ??
          false,

        confirmedAt:
          row?.confirmedAt ??
          null,

        source:
          "postgresql" as const,
      };
    },
  );

  app.post(
    "/api/v1/security/mfa/setup",
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

      const body =
        passwordBody.safeParse(
          request.body,
        );

      if (!body.success) {
        return reply
          .code(400)
          .send({
            error: {
              code:
                "VALIDATION_ERROR",

              message:
                "Password is required.",
            },
          });
      }

      if (
        !(
          await verifyPassword(
            user.id,
            body.data.password,
          )
        )
      ) {
        return reply
          .code(403)
          .send({
            error: {
              code:
                "PASSWORD_REAUTH_FAILED",

              message:
                "Password re-authentication failed.",
            },
          });
      }

      const [
        existing,
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
        existing?.enabled
      ) {
        return reply
          .code(409)
          .send({
            error: {
              code:
                "MFA_ALREADY_ENABLED",

              message:
                "TOTP MFA is already enabled.",
            },
          });
      }

      const secret =
        generateTotpSecret();

      const encryptedSecret =
        encryptTotpSecret(
          secret,
        );

      if (existing) {
        await db
          .update(
            userTotpMfa,
          )
          .set({
            encryptedSecret,

            enabled:
              false,

            confirmedAt:
              null,

            updatedAt:
              new Date(),
          })
          .where(
            eq(
              userTotpMfa.userId,
              user.id,
            ),
          );
      }
      else {
        await db
          .insert(
            userTotpMfa,
          )
          .values({
            userId:
              user.id,

            encryptedSecret,

            enabled:
              false,
          });
      }

      return {
        secret,

        otpauthUri:
          buildOtpAuthUri(
            user.email,
            secret,
          ),

        source:
          "postgresql" as const,
      };
    },
  );

  app.post(
    "/api/v1/security/mfa/confirm",
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

      const body =
        confirmBody.safeParse(
          request.body,
        );

      if (!body.success) {
        return reply
          .code(400)
          .send({
            error: {
              code:
                "VALIDATION_ERROR",

              message:
                "A six-digit TOTP code is required.",
            },
          });
      }

      const [
        row,
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

      if (!row) {
        return reply
          .code(404)
          .send({
            error: {
              code:
                "MFA_SETUP_NOT_FOUND",

              message:
                "Start MFA setup first.",
            },
          });
      }

      if (
        !verifyEncryptedTotp(
          row.encryptedSecret,
          body.data.code,
        )
      ) {
        return reply
          .code(400)
          .send({
            error: {
              code:
                "INVALID_TOTP",

              message:
                "The TOTP code is invalid.",
            },
          });
      }

      const now =
        new Date();

      await db
        .update(
          userTotpMfa,
        )
        .set({
          enabled:
            true,

          confirmedAt:
            now,

          updatedAt:
            now,
        })
        .where(
          eq(
            userTotpMfa.userId,
            user.id,
          ),
        );

      return {
        ok:
          true,

        enabled:
          true,
      };
    },
  );

  app.post(
    "/api/v1/security/mfa/disable",
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

      const body =
        disableBody.safeParse(
          request.body,
        );

      if (!body.success) {
        return reply
          .code(400)
          .send({
            error: {
              code:
                "VALIDATION_ERROR",

              message:
                "Password and TOTP code are required.",
            },
          });
      }

      if (
        !(
          await verifyPassword(
            user.id,
            body.data.password,
          )
        )
      ) {
        return reply
          .code(403)
          .send({
            error: {
              code:
                "PASSWORD_REAUTH_FAILED",

              message:
                "Password re-authentication failed.",
            },
          });
      }

      const [
        row,
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
        !row ||
        !row.enabled ||
        !verifyEncryptedTotp(
          row.encryptedSecret,
          body.data.code,
        )
      ) {
        return reply
          .code(400)
          .send({
            error: {
              code:
                "INVALID_TOTP",

              message:
                "The TOTP code is invalid.",
            },
          });
      }

      await db
        .delete(
          userTotpMfa,
        )
        .where(
          eq(
            userTotpMfa.userId,
            user.id,
          ),
        );

      return {
        ok:
          true,

        enabled:
          false,
      };
    },
  );
}