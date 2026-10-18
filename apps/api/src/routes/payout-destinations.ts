import type {
  FastifyInstance,
  FastifyRequest,
} from "fastify";

import {
  verify,
} from "@node-rs/argon2";

import {
  and,
  desc,
  eq,
  inArray,
  sql,
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
  marketplaceAdminAuditLogs,
  marketplaceAdmins,
  sellerPayoutDestinations,
  storeMembers,
  stores,
  users,
} from "../db/schema.js";

import {
  encryptPayoutIban,
  maskedPayoutIban,
  normalizeIranIban,
  payoutIbanFingerprint,
} from "../finance/payout-destination-crypto.js";

const storeParams =
  z.object({
    storeId:
      z.string().uuid(),
  });

const destinationParams =
  z.object({
    destinationId:
      z.string().uuid(),
  });

const destinationBody =
  z.object({
    iban:
      z.string()
        .trim()
        .min(20)
        .max(40),

    accountHolderName:
      z.string()
        .trim()
        .min(3)
        .max(160),

    password:
      z.string()
        .min(12)
        .max(128),
  });

const reviewBody =
  z.object({
    action:
      z.enum([
        "APPROVE",
        "REJECT",
      ]),

    reason:
      z.string()
        .trim()
        .min(3)
        .max(500),

    password:
      z.string()
        .min(12)
        .max(128),
  });

async function verifyUserPassword(
  userId: string,
  password: string,
) {
  const [row] =
    await db
      .select({
        passwordHash:
          users.passwordHash,
      })
      .from(users)
      .where(
        eq(
          users.id,
          userId,
        ),
      )
      .limit(1);

  if (!row?.passwordHash) {
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

async function requireStoreOwner(
  userId: string,
  storeId: string,
) {
  const [row] =
    await db
      .select({
        role:
          storeMembers.role,

        storeName:
          stores.name,
      })
      .from(storeMembers)
      .innerJoin(
        stores,
        eq(
          stores.id,
          storeMembers.storeId,
        ),
      )
      .where(
        and(
          eq(
            storeMembers.userId,
            userId,
          ),
          eq(
            storeMembers.storeId,
            storeId,
          ),
        ),
      )
      .limit(1);

  if (
    !row ||
    row.role !== "OWNER"
  ) {
    return null;
  }

  return row;
}

async function requireAdmin(
  request: FastifyRequest,
) {
  const user =
    await requireAuthUser(
      request,
    );

  if (!user) {
    return null;
  }

  const [admin] =
    await db
      .select({
        role:
          marketplaceAdmins.role,
      })
      .from(
        marketplaceAdmins,
      )
      .where(
        and(
          eq(
            marketplaceAdmins.userId,
            user.id,
          ),
          eq(
            marketplaceAdmins.active,
            true,
          ),
        ),
      )
      .limit(1);

  if (!admin) {
    return null;
  }

  return {
    userId:
      user.id,

    role:
      admin.role,
  };
}

async function adminReauth(
  request: FastifyRequest,
  password: string,
) {
  const admin =
    await requireAdmin(
      request,
    );

  if (
    !admin ||
    admin.role === "SUPPORT"
  ) {
    return null;
  }

  const valid =
    await verifyUserPassword(
      admin.userId,
      password,
    );

  return valid
    ? admin
    : null;
}

function publicDestination(
  row: {
    id: string;
    storeId: string;
    method: string;
    ibanLast4: string;
    accountHolderName: string;
    status:
      | "PENDING_REVIEW"
      | "VERIFIED"
      | "DISABLED"
      | "REJECTED";
    reviewReason: string | null;
    reviewedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
  },
) {
  return {
    id:
      row.id,

    storeId:
      row.storeId,

    method:
      row.method,

    ibanMasked:
      maskedPayoutIban(
        row.ibanLast4,
      ),

    accountHolderName:
      row.accountHolderName,

    status:
      row.status,

    reviewReason:
      row.reviewReason,

    reviewedAt:
      row.reviewedAt,

    createdAt:
      row.createdAt,

    updatedAt:
      row.updatedAt,
  };
}

export async function registerPayoutDestinationRoutes(
  app: FastifyInstance,
) {
  app.get(
    "/api/v1/seller/stores/:storeId/payout-destination",
    async (
      request,
      reply,
    ) => {
      const user =
        await requireAuthUser(
          request,
        );

      const params =
        storeParams.safeParse(
          request.params,
        );

      if (!user) {
        return reply.code(401).send({
          error: {
            code:
              "UNAUTHORIZED",

            message:
              "Authentication required.",
          },
        });
      }

      if (!params.success) {
        return reply.code(400).send({
          error: {
            code:
              "VALIDATION_ERROR",

            message:
              "Invalid store id.",
          },
        });
      }

      const owner =
        await requireStoreOwner(
          user.id,
          params.data.storeId,
        );

      if (!owner) {
        return reply.code(403).send({
          error: {
            code:
              "SELLER_OWNER_REQUIRED",

            message:
              "Store owner access is required.",
          },
        });
      }

      const [destination] =
        await db
          .select()
          .from(
            sellerPayoutDestinations,
          )
          .where(
            eq(
              sellerPayoutDestinations.storeId,
              params.data.storeId,
            ),
          )
          .orderBy(
            desc(
              sellerPayoutDestinations.createdAt,
            ),
          )
          .limit(1);

      return {
        destination:
          destination
            ? publicDestination(
                destination,
              )
            : null,

        source:
          "postgresql" as const,
      };
    },
  );

  app.put(
    "/api/v1/seller/stores/:storeId/payout-destination",
    async (
      request,
      reply,
    ) => {
      const user =
        await requireAuthUser(
          request,
        );

      const params =
        storeParams.safeParse(
          request.params,
        );

      const body =
        destinationBody.safeParse(
          request.body,
        );

      if (!user) {
        return reply.code(401).send({
          error: {
            code:
              "UNAUTHORIZED",

            message:
              "Authentication required.",
          },
        });
      }

      if (
        !params.success ||
        !body.success
      ) {
        return reply.code(400).send({
          error: {
            code:
              "VALIDATION_ERROR",

            message:
              "Invalid payout destination request.",
          },
        });
      }

      const owner =
        await requireStoreOwner(
          user.id,
          params.data.storeId,
        );

      if (!owner) {
        return reply.code(403).send({
          error: {
            code:
              "SELLER_OWNER_REQUIRED",

            message:
              "Only the store owner may change payout destination.",
          },
        });
      }

      if (
        !await verifyUserPassword(
          user.id,
          body.data.password,
        )
      ) {
        return reply.code(403).send({
          error: {
            code:
              "SELLER_REAUTH_FAILED",

            message:
              "Password re-authentication failed.",
          },
        });
      }

      let normalizedIban:
        string;

      try {
        normalizedIban =
          normalizeIranIban(
            body.data.iban,
          );
      }
      catch (error) {
        return reply.code(400).send({
          error: {
            code:
              "INVALID_IRAN_IBAN",

            message:
              error instanceof Error
                ? error.message
                : "Invalid Iranian IBAN.",
          },
        });
      }

      const fingerprint =
        payoutIbanFingerprint(
          normalizedIban,
        );

      const encrypted =
        encryptPayoutIban(
          normalizedIban,
        );

      const created =
        await db.transaction(
          async tx => {
            await tx.execute(
              sql`
                SELECT pg_advisory_xact_lock(
                  hashtextextended(
                    ${`payout-destination:${params.data.storeId}`},
                    0
                  )
                )
              `,
            );

            const [latest] =
              await tx
                .select()
                .from(
                  sellerPayoutDestinations,
                )
                .where(
                  eq(
                    sellerPayoutDestinations.storeId,
                    params.data.storeId,
                  ),
                )
                .orderBy(
                  desc(
                    sellerPayoutDestinations.createdAt,
                  ),
                )
                .limit(1);

            const sameActive =
              latest &&
              latest.ibanFingerprint ===
                fingerprint &&
              latest.accountHolderName ===
                body.data.accountHolderName &&
              (
                latest.status ===
                  "PENDING_REVIEW" ||
                latest.status ===
                  "VERIFIED"
              );

            if (sameActive) {
              return {
                row:
                  latest,

                idempotent:
                  true,
              };
            }

            await tx
              .update(
                sellerPayoutDestinations,
              )
              .set({
                status:
                  "DISABLED",

                updatedAt:
                  new Date(),
              })
              .where(
                and(
                  eq(
                    sellerPayoutDestinations.storeId,
                    params.data.storeId,
                  ),
                  inArray(
                    sellerPayoutDestinations.status,
                    [
                      "PENDING_REVIEW",
                      "VERIFIED",
                    ],
                  ),
                ),
              );

            const [row] =
              await tx
                .insert(
                  sellerPayoutDestinations,
                )
                .values({
                  storeId:
                    params.data.storeId,

                  createdByUserId:
                    user.id,

                  method:
                    "IR_IBAN",

                  ibanCiphertext:
                    encrypted.ciphertext,

                  ibanIv:
                    encrypted.iv,

                  ibanAuthTag:
                    encrypted.authTag,

                  ibanLast4:
                    encrypted.last4,

                  ibanFingerprint:
                    encrypted.fingerprint,

                  accountHolderName:
                    body.data.accountHolderName,

                  status:
                    "PENDING_REVIEW",

                  updatedAt:
                    new Date(),
                })
                .returning();

            if (!row) {
              throw new Error(
                "Payout destination creation failed.",
              );
            }

            return {
              row,
              idempotent:
                false,
            };
          },
        );

      return reply
        .code(
          created.idempotent
            ? 200
            : 201,
        )
        .send({
          destination:
            publicDestination(
              created.row,
            ),

          idempotent:
            created.idempotent,

          source:
            "postgresql",
        });
    },
  );

  app.get(
    "/api/v1/admin/marketplace/payout-destinations",
    async (
      request,
      reply,
    ) => {
      const admin =
        await requireAdmin(
          request,
        );

      if (!admin) {
        return reply.code(403).send({
          error: {
            code:
              "ADMIN_FORBIDDEN",

            message:
              "Admin access required.",
          },
        });
      }

      const rows =
        await db
          .select({
            id:
              sellerPayoutDestinations.id,

            storeId:
              sellerPayoutDestinations.storeId,

            storeName:
              stores.name,

            method:
              sellerPayoutDestinations.method,

            ibanLast4:
              sellerPayoutDestinations.ibanLast4,

            accountHolderName:
              sellerPayoutDestinations.accountHolderName,

            status:
              sellerPayoutDestinations.status,

            reviewReason:
              sellerPayoutDestinations.reviewReason,

            reviewedAt:
              sellerPayoutDestinations.reviewedAt,

            createdAt:
              sellerPayoutDestinations.createdAt,

            updatedAt:
              sellerPayoutDestinations.updatedAt,
          })
          .from(
            sellerPayoutDestinations,
          )
          .innerJoin(
            stores,
            eq(
              stores.id,
              sellerPayoutDestinations.storeId,
            ),
          )
          .orderBy(
            desc(
              sellerPayoutDestinations.createdAt,
            ),
          );

      return {
        data:
          rows.map(
            row =>
              publicDestination(row),
          ),

        source:
          "postgresql" as const,
      };
    },
  );

  app.post(
    "/api/v1/admin/marketplace/payout-destinations/:destinationId/review",
    async (
      request,
      reply,
    ) => {
      const params =
        destinationParams.safeParse(
          request.params,
        );

      const body =
        reviewBody.safeParse(
          request.body,
        );

      if (
        !params.success ||
        !body.success
      ) {
        return reply.code(400).send({
          error: {
            code:
              "VALIDATION_ERROR",

            message:
              "Invalid payout destination review request.",
          },
        });
      }

      const admin =
        await adminReauth(
          request,
          body.data.password,
        );

      if (!admin) {
        return reply.code(403).send({
          error: {
            code:
              "ADMIN_REAUTH_FAILED",

            message:
              "Admin re-authentication failed or role is insufficient.",
          },
        });
      }

      const result =
        await db.transaction(
          async tx => {
            const [current] =
              await tx
                .select()
                .from(
                  sellerPayoutDestinations,
                )
                .where(
                  eq(
                    sellerPayoutDestinations.id,
                    params.data.destinationId,
                  ),
                )
                .limit(1);

            if (!current) {
              return null;
            }

            await tx.execute(
              sql`
                SELECT pg_advisory_xact_lock(
                  hashtextextended(
                    ${`payout-destination:${current.storeId}`},
                    0
                  )
                )
              `,
            );

            if (
              current.status !==
              "PENDING_REVIEW"
            ) {
              return {
                conflict:
                  true as const,

                row:
                  current,
              };
            }

            if (
              body.data.action ===
              "APPROVE"
            ) {
              await tx
                .update(
                  sellerPayoutDestinations,
                )
                .set({
                  status:
                    "DISABLED",

                  updatedAt:
                    new Date(),
                })
                .where(
                  and(
                    eq(
                      sellerPayoutDestinations.storeId,
                      current.storeId,
                    ),
                    eq(
                      sellerPayoutDestinations.status,
                      "VERIFIED",
                    ),
                  ),
                );
            }

            const [reviewed] =
              await tx
                .update(
                  sellerPayoutDestinations,
                )
                .set({
                  status:
                    body.data.action ===
                      "APPROVE"
                      ? "VERIFIED"
                      : "REJECTED",

                  reviewedByAdminUserId:
                    admin.userId,

                  reviewReason:
                    body.data.reason,

                  reviewedAt:
                    new Date(),

                  updatedAt:
                    new Date(),
                })
                .where(
                  eq(
                    sellerPayoutDestinations.id,
                    current.id,
                  ),
                )
                .returning();

            if (!reviewed) {
              throw new Error(
                "Payout destination review update failed.",
              );
            }

            await tx
              .insert(
                marketplaceAdminAuditLogs,
              )
              .values({
                adminUserId:
                  admin.userId,

                action:
                  body.data.action ===
                    "APPROVE"
                    ? "PAYOUT_DESTINATION_APPROVE"
                    : "PAYOUT_DESTINATION_REJECT",

                entityType:
                  "seller_payout_destination",

                entityId:
                  reviewed.id,

                details:
                  JSON.stringify({
                    storeId:
                      reviewed.storeId,

                    ibanLast4:
                      reviewed.ibanLast4,

                    status:
                      reviewed.status,

                    reason:
                      body.data.reason,
                  }).slice(
                    0,
                    1800,
                  ),
              });

            return {
              conflict:
                false as const,

              row:
                reviewed,
            };
          },
        );

      if (!result) {
        return reply.code(404).send({
          error: {
            code:
              "PAYOUT_DESTINATION_NOT_FOUND",

            message:
              "Payout destination was not found.",
          },
        });
      }

      if (result.conflict) {
        return reply.code(409).send({
          error: {
            code:
              "PAYOUT_DESTINATION_NOT_PENDING",

            message:
              "Only a pending payout destination can be reviewed.",
          },
        });
      }

      return {
        destination:
          publicDestination(
            result.row,
          ),

        source:
          "postgresql" as const,
      };
    },
  );
}
