
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
  releasePayoutReservation,
} from "../finance/seller-balance-policy.js";

import {
  financialLedgerPostings,
  financialLedgerTransactions,
  marketplaceAdminAuditLogs,
  marketplaceAdmins,
  payoutRequestDestinationSnapshots,
  sellerBalances,
  sellerPayoutDestinations,
  sellerPayoutRequests,
  storeMembers,
  stores,
  users,
} from "../db/schema.js";

const sellerStoreParams =
  z.object({
    storeId:
      z.string()
        .uuid(),
  });

const payoutParams =
  z.object({
    payoutId:
      z.string()
        .uuid(),
  });

const requestBody =
  z.object({
    amountRial:
      z.number()
        .int()
        .min(10_000)
        .max(2_000_000_000),
  });

const reviewBody =
  z.object({
    action:
      z.enum([
        "APPROVE",
        "REJECT",
      ]),

    password:
      z.string()
        .min(12)
        .max(128),

    reason:
      z.string()
        .trim()
        .min(3)
        .max(500),
  });

const paidBody =
  z.object({
    password:
      z.string()
        .min(12)
        .max(128),

    payoutReference:
      z.string()
        .trim()
        .min(4)
        .max(220),
  });

async function sellerAccess(
  userId: string,
  storeId: string,
) {
  const [
    row,
  ] =
    await db
      .select({
        role:
          storeMembers.role,

        storeName:
          stores.name,
      })
      .from(
        storeMembers,
      )
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
    ![
      "OWNER",
      "MANAGER",
    ].includes(
      row.role,
    )
  ) {
    return null;
  }

  return row;
}

async function adminReauth(
  request: FastifyRequest,
  password: string,
) {
  const user =
    await requireAuthUser(
      request,
    );

  if (!user) {
    return null;
  }

  const [
    admin,
  ] =
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

  if (
    !admin ||
    admin.role ===
      "SUPPORT"
  ) {
    return null;
  }

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
          user.id,
        ),
      )
      .limit(1);

  if (!row?.passwordHash) {
    return null;
  }

  try {
    const valid =
      await verify(
        row.passwordHash,
        password,
      );

    return valid
      ? {
          userId:
            user.id,

          role:
            admin.role,
        }
      : null;
  }
  catch {
    return null;
  }
}

async function audit(
  adminUserId: string,
  action: string,
  entityId: string,
  details: unknown,
) {
  await db
    .insert(
      marketplaceAdminAuditLogs,
    )
    .values({
      adminUserId,

      action,

      entityType:
        "seller_payout_request",

      entityId,

      details:
        JSON.stringify(
          details,
        ).slice(
          0,
          1800,
        ),
    });
}

export async function registerPayoutRoutes(
  app: FastifyInstance,
) {
  app.get(
    "/api/v1/seller/stores/:storeId/payouts",
    async (
      request,
      reply,
    ) => {
      const user =
        await requireAuthUser(
          request,
        );

      const params =
        sellerStoreParams.safeParse(
          request.params,
        );

      if (
        !user ||
        !params.success
      ) {
        return reply
          .code(
            user
              ? 400
              : 401,
          )
          .send({
            error: {
              code:
                user
                  ? "VALIDATION_ERROR"
                  : "UNAUTHORIZED",

              message:
                user
                  ? "Invalid store id."
                  : "Authentication required.",
            },
          });
      }

      const access =
        await sellerAccess(
          user.id,
          params.data.storeId,
        );

      if (!access) {
        return reply
          .code(403)
          .send({
            error: {
              code:
                "SELLER_FORBIDDEN",

              message:
                "Owner or manager access is required.",
            },
          });
      }

      const [
        balance,
      ] =
        await db
          .select()
          .from(
            sellerBalances,
          )
          .where(
            eq(
              sellerBalances.storeId,
              params.data.storeId,
            ),
          )
          .limit(1);

      const payouts =
        await db
          .select()
          .from(
            sellerPayoutRequests,
          )
          .where(
            eq(
              sellerPayoutRequests.storeId,
              params.data.storeId,
            ),
          )
          .orderBy(
            desc(
              sellerPayoutRequests.requestedAt,
            ),
          );

      return {
        store: {
          id:
            params.data.storeId,

          name:
            access.storeName,
        },

        balance: {
          pendingRial:
            balance?.pendingRial ??
            0,

          availableRial:
            balance?.availableRial ??
            0,

          negativeRial:
            balance?.negativeRial ??
            0,

          paidOutRial:
            balance?.paidOutRial ??
            0,
        },

        payouts,

        source:
          "postgresql" as const,
      };
    },
  );

  app.post(
    "/api/v1/seller/stores/:storeId/payouts",
    async (
      request,
      reply,
    ) => {
      const user =
        await requireAuthUser(
          request,
        );

      const params =
        sellerStoreParams.safeParse(
          request.params,
        );

      const body =
        requestBody.safeParse(
          request.body,
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

      if (
        !params.success ||
        !body.success
      ) {
        return reply
          .code(400)
          .send({
            error: {
              code:
                "VALIDATION_ERROR",

              message:
                "Invalid payout request.",
            },
          });
      }

      const access =
        await sellerAccess(
          user.id,
          params.data.storeId,
        );

      if (!access) {
        return reply
          .code(403)
          .send({
            error: {
              code:
                "SELLER_FORBIDDEN",

              message:
                "Owner or manager access is required.",
            },
          });
      }

      try {
        const payout =
          await db.transaction(
            async (
              tx,
            ) => {
              await tx.execute(
                sql`
                  SELECT pg_advisory_xact_lock(
                    hashtextextended(
                      ${`seller-balance:${params.data.storeId}`},
                      0
                    )
                  )
                `,
              );

              const [
                balance,
              ] =
                await tx
                  .select()
                  .from(
                    sellerBalances,
                  )
                  .where(
                    eq(
                      sellerBalances.storeId,
                      params.data.storeId,
                    ),
                  )
                  .limit(1);

              if (
                !balance ||
                balance.negativeRial >
                  0
              ) {
                throw new Error(
                  "SELLER_BALANCE_HAS_CLAWBACK",
                );
              }

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

              const [
                payoutDestination,
              ] =
                await tx
                  .select()
                  .from(
                    sellerPayoutDestinations,
                  )
                  .where(
                    and(
                      eq(
                        sellerPayoutDestinations.storeId,
                        params.data.storeId,
                      ),

                      eq(
                        sellerPayoutDestinations.status,
                        "VERIFIED",
                      ),
                    ),
                  )
                  .orderBy(
                    desc(
                      sellerPayoutDestinations.createdAt,
                    ),
                  )
                  .limit(1);

              if (!payoutDestination) {
                throw new Error(
                  "PAYOUT_DESTINATION_REQUIRED",
                );
              }

              const reserved =
                await tx
                  .update(
                    sellerBalances,
                  )
                  .set({
                    availableRial:
                      sql`${sellerBalances.availableRial} - ${body.data.amountRial}`,

                    updatedAt:
                      new Date(),
                  })
                  .where(
                    and(
                      eq(
                        sellerBalances.storeId,
                        params.data.storeId,
                      ),

                      sql`${sellerBalances.availableRial} >= ${body.data.amountRial}`,

                      eq(
                        sellerBalances.negativeRial,
                        0,
                      ),
                    ),
                  )
                  .returning({
                    storeId:
                      sellerBalances.storeId,
                  });

              if (
                reserved.length !==
                1
              ) {
                throw new Error(
                  "INSUFFICIENT_AVAILABLE_BALANCE",
                );
              }

              const [
                created,
              ] =
                await tx
                  .insert(
                    sellerPayoutRequests,
                  )
                  .values({
                    storeId:
                      params.data.storeId,

                    requestedByUserId:
                      user.id,

                    amountRial:
                      body.data.amountRial,

                    status:
                      "REQUESTED",

                    updatedAt:
                      new Date(),
                  })
                  .returning();

              if (!created) {
                throw new Error(
                  "Payout request creation failed.",
                );
              }

              await tx
                .insert(
                  payoutRequestDestinationSnapshots,
                )
                .values({
                  payoutId:
                    created.id,

                  destinationId:
                    payoutDestination.id,

                  method:
                    payoutDestination.method,

                  ibanCiphertext:
                    payoutDestination.ibanCiphertext,

                  ibanIv:
                    payoutDestination.ibanIv,

                  ibanAuthTag:
                    payoutDestination.ibanAuthTag,

                  ibanLast4:
                    payoutDestination.ibanLast4,

                  ibanFingerprint:
                    payoutDestination.ibanFingerprint,

                  accountHolderName:
                    payoutDestination.accountHolderName,
                });

              return created;
            },
          );

        return reply
          .code(201)
          .send({
            payout,

            source:
              "postgresql",
          });
      }
      catch (error) {
        if (
          error instanceof Error &&
          error.message ===
            "PAYOUT_DESTINATION_REQUIRED"
        ) {
          return reply
            .code(409)
            .send({
              error: {
                code:
                  "PAYOUT_DESTINATION_REQUIRED",

                message:
                  "A VERIFIED payout destination is required before requesting a payout.",
              },
            });
        }

        if (
          error instanceof Error &&
          error.message ===
            "SELLER_BALANCE_HAS_CLAWBACK"
        ) {
          return reply
            .code(409)
            .send({
              error: {
                code:
                  "SELLER_BALANCE_HAS_CLAWBACK",

                message:
                  "Seller payout is blocked until the negative balance is recovered.",
              },
            });
        }

        if (
          error instanceof Error &&
          error.message ===
            "INSUFFICIENT_AVAILABLE_BALANCE"
        ) {
          return reply
            .code(409)
            .send({
              error: {
                code:
                  "INSUFFICIENT_AVAILABLE_BALANCE",

                message:
                  "Available seller balance is insufficient.",
              },
            });
        }

        throw error;
      }
    },
  );

  app.get(
    "/api/v1/admin/marketplace/payouts",
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
        admin,
      ] =
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
        return reply
          .code(403)
          .send({
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
              sellerPayoutRequests.id,

            storeId:
              sellerPayoutRequests.storeId,

            storeName:
              stores.name,

            amountRial:
              sellerPayoutRequests.amountRial,

            status:
              sellerPayoutRequests.status,

            payoutReference:
              sellerPayoutRequests.payoutReference,

            requestedAt:
              sellerPayoutRequests.requestedAt,

            reviewedAt:
              sellerPayoutRequests.reviewedAt,

            paidAt:
              sellerPayoutRequests.paidAt,
          })
          .from(
            sellerPayoutRequests,
          )
          .innerJoin(
            stores,
            eq(
              stores.id,
              sellerPayoutRequests.storeId,
            ),
          )
          .orderBy(
            desc(
              sellerPayoutRequests.requestedAt,
            ),
          );

      return {
        data:
          rows,

        source:
          "postgresql" as const,
      };
    },
  );

  app.post(
    "/api/v1/admin/marketplace/payouts/:payoutId/review",
    async (
      request,
      reply,
    ) => {
      const params =
        payoutParams.safeParse(
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
        return reply
          .code(400)
          .send({
            error: {
              code:
                "VALIDATION_ERROR",

              message:
                "Invalid payout review request.",
            },
          });
      }

      const admin =
        await adminReauth(
          request,
          body.data.password,
        );

      if (!admin) {
        return reply
          .code(403)
          .send({
            error: {
              code:
                "ADMIN_REAUTH_FAILED",

              message:
                "Admin password re-authentication failed.",
            },
          });
      }

      try {
        const result =
          await db.transaction(
            async (
              tx,
            ) => {
              const [
                payout,
              ] =
                await tx
                  .select()
                  .from(
                    sellerPayoutRequests,
                  )
                  .where(
                    eq(
                      sellerPayoutRequests.id,
                      params.data.payoutId,
                    ),
                  )
                  .limit(1);

              if (!payout) {
                throw new Error(
                  "PAYOUT_NOT_FOUND",
                );
              }

              if (
                body.data.action ===
                  "APPROVE" &&
                payout.status !==
                  "REQUESTED"
              ) {
                throw new Error(
                  "INVALID_PAYOUT_STATE",
                );
              }

              if (
                body.data.action ===
                  "REJECT" &&
                ![
                  "REQUESTED",
                  "APPROVED",
                ].includes(
                  payout.status,
                )
              ) {
                throw new Error(
                  "INVALID_PAYOUT_STATE",
                );
              }

              const now =
                new Date();

              if (
                body.data.action ===
                "REJECT"
              ) {
                await tx.execute(
                  sql`
                    SELECT pg_advisory_xact_lock(
                      hashtextextended(
                        ${`seller-balance:${payout.storeId}`},
                        0
                      )
                    )
                  `,
                );

                const [
                  balance,
                ] =
                  await tx
                    .select()
                    .from(
                      sellerBalances,
                    )
                    .where(
                      eq(
                        sellerBalances.storeId,
                        payout.storeId,
                      ),
                    )
                    .limit(1);

                if (!balance) {
                  throw new Error(
                    "SELLER_BALANCE_NOT_FOUND",
                  );
                }

                const nextBalance =
                  releasePayoutReservation(
                    balance,
                    payout.amountRial,
                  );

                await tx
                  .update(
                    sellerBalances,
                  )
                  .set({
                    availableRial:
                      nextBalance.availableRial,

                    negativeRial:
                      nextBalance.negativeRial,

                    updatedAt:
                      now,
                  })
                  .where(
                    eq(
                      sellerBalances.storeId,
                      payout.storeId,
                    ),
                  );

                await tx
                  .update(
                    sellerPayoutRequests,
                  )
                  .set({
                    status:
                      "REJECTED",

                    reviewedByAdminUserId:
                      admin.userId,

                    reviewReason:
                      body.data.reason,

                    reviewedAt:
                      now,

                    updatedAt:
                      now,
                  })
                  .where(
                    eq(
                      sellerPayoutRequests.id,
                      payout.id,
                    ),
                  );

                return {
                  status:
                    "REJECTED" as const,
                };
              }

              await tx
                .update(
                  sellerPayoutRequests,
                )
                .set({
                  status:
                    "APPROVED",

                  reviewedByAdminUserId:
                    admin.userId,

                  reviewReason:
                    body.data.reason,

                  reviewedAt:
                    now,

                  updatedAt:
                    now,
                })
                .where(
                  eq(
                    sellerPayoutRequests.id,
                    payout.id,
                  ),
                );

              return {
                status:
                  "APPROVED" as const,
              };
            },
          );

        await audit(
          admin.userId,
          `PAYOUT_${body.data.action}`,
          params.data.payoutId,
          {
            reason:
              body.data.reason,
          },
        );

        return {
          ok:
            true,

          ...result,

          source:
            "postgresql" as const,
        };
      }
      catch (error) {
        if (
          error instanceof Error &&
          error.message ===
            "PAYOUT_NOT_FOUND"
        ) {
          return reply
            .code(404)
            .send({
              error: {
                code:
                  "PAYOUT_NOT_FOUND",

                message:
                  "Payout request was not found.",
              },
            });
        }

        if (
          error instanceof Error &&
          error.message ===
            "INVALID_PAYOUT_STATE"
        ) {
          return reply
            .code(409)
            .send({
              error: {
                code:
                  "INVALID_PAYOUT_STATE",

                message:
                  "Payout review action is not valid for the current state.",
              },
            });
        }

        throw error;
      }
    },
  );

  app.post(
    "/api/v1/admin/marketplace/payouts/:payoutId/mark-paid",
    async (
      request,
      reply,
    ) => {
      const params =
        payoutParams.safeParse(
          request.params,
        );

      const body =
        paidBody.safeParse(
          request.body,
        );

      if (
        !params.success ||
        !body.success
      ) {
        return reply
          .code(400)
          .send({
            error: {
              code:
                "VALIDATION_ERROR",

              message:
                "Invalid payout completion request.",
            },
          });
      }

      const admin =
        await adminReauth(
          request,
          body.data.password,
        );

      if (!admin) {
        return reply
          .code(403)
          .send({
            error: {
              code:
                "ADMIN_REAUTH_FAILED",

              message:
                "Admin password re-authentication failed.",
            },
          });
      }

      try {
        const result =
          await db.transaction(
            async (
              tx,
            ) => {
              const [
                payout,
              ] =
                await tx
                  .select()
                  .from(
                    sellerPayoutRequests,
                  )
                  .where(
                    eq(
                      sellerPayoutRequests.id,
                      params.data.payoutId,
                    ),
                  )
                  .limit(1);

              if (!payout) {
                throw new Error(
                  "PAYOUT_NOT_FOUND",
                );
              }

              if (
                payout.status !==
                "APPROVED"
              ) {
                throw new Error(
                  "INVALID_PAYOUT_STATE",
                );
              }

              await tx.execute(
                sql`
                  SELECT pg_advisory_xact_lock(
                    hashtextextended(
                      ${`seller-balance:${payout.storeId}`},
                      0
                    )
                  )
                `,
              );

              const [
                balance,
              ] =
                await tx
                  .select()
                  .from(
                    sellerBalances,
                  )
                  .where(
                    eq(
                      sellerBalances.storeId,
                      payout.storeId,
                    ),
                  )
                  .limit(1);

              if (
                !balance ||
                balance.negativeRial >
                  0
              ) {
                throw new Error(
                  "SELLER_BALANCE_HAS_CLAWBACK",
                );
              }

              const [
                duplicateReference,
              ] =
                await tx
                  .select({
                    id:
                      sellerPayoutRequests.id,
                  })
                  .from(
                    sellerPayoutRequests,
                  )
                  .where(
                    eq(
                      sellerPayoutRequests.payoutReference,
                      body.data.payoutReference,
                    ),
                  )
                  .limit(1);

              if (duplicateReference) {
                throw new Error(
                  "PAYOUT_REFERENCE_EXISTS",
                );
              }

              const now =
                new Date();

              await tx
                .update(
                  sellerBalances,
                )
                .set({
                  paidOutRial:
                    sql`${sellerBalances.paidOutRial} + ${payout.amountRial}`,

                  updatedAt:
                    now,
                })
                .where(
                  eq(
                    sellerBalances.storeId,
                    payout.storeId,
                  ),
                );

              const [
                ledger,
              ] =
                await tx
                  .insert(
                    financialLedgerTransactions,
                  )
                  .values({
                    kind:
                      "PAYOUT",

                    orderId:
                      null,

                    paymentId:
                      null,

                    refundId:
                      null,

                    idempotencyKey:
                      `payout:${payout.id}`,
                  })
                  .returning({
                    id:
                      financialLedgerTransactions.id,
                  });

              if (!ledger) {
                throw new Error(
                  "Payout ledger transaction failed.",
                );
              }

              await tx
                .insert(
                  financialLedgerPostings,
                )
                .values([
                  {
                    transactionId:
                      ledger.id,

                    accountCode:
                      "SELLER_PAYABLE",

                    storeId:
                      payout.storeId,

                    amountRial:
                      payout.amountRial,
                  },

                  {
                    transactionId:
                      ledger.id,

                    accountCode:
                      "PLATFORM_CASH",

                    storeId:
                      null,

                    amountRial:
                      -payout.amountRial,
                  },
                ]);

              await tx
                .update(
                  sellerPayoutRequests,
                )
                .set({
                  status:
                    "PAID",

                  payoutReference:
                    body.data.payoutReference,

                  paidAt:
                    now,

                  updatedAt:
                    now,
                })
                .where(
                  eq(
                    sellerPayoutRequests.id,
                    payout.id,
                  ),
                );

              return {
                storeId:
                  payout.storeId,

                amountRial:
                  payout.amountRial,

                status:
                  "PAID" as const,
              };
            },
          );

        await audit(
          admin.userId,
          "PAYOUT_MARK_PAID",
          params.data.payoutId,
          {
            payoutReference:
              body.data.payoutReference,

            amountRial:
              result.amountRial,
          },
        );

        return {
          ok:
            true,

          ...result,

          source:
            "postgresql" as const,
        };
      }
      catch (error) {
        if (
          error instanceof Error &&
          error.message ===
            "PAYOUT_NOT_FOUND"
        ) {
          return reply
            .code(404)
            .send({
              error: {
                code:
                  "PAYOUT_NOT_FOUND",

                message:
                  "Payout request was not found.",
              },
            });
        }

        if (
          error instanceof Error &&
          error.message ===
            "INVALID_PAYOUT_STATE"
        ) {
          return reply
            .code(409)
            .send({
              error: {
                code:
                  "INVALID_PAYOUT_STATE",

                message:
                  "Payout request must be APPROVED first.",
              },
            });
        }

        if (
          error instanceof Error &&
          error.message ===
            "SELLER_BALANCE_HAS_CLAWBACK"
        ) {
          return reply
            .code(409)
            .send({
              error: {
                code:
                  "SELLER_BALANCE_HAS_CLAWBACK",

                message:
                  "Payout completion is blocked until the negative seller balance is recovered.",
              },
            });
        }

        if (
          error instanceof Error &&
          error.message ===
            "PAYOUT_REFERENCE_EXISTS"
        ) {
          return reply
            .code(409)
            .send({
              error: {
                code:
                  "PAYOUT_REFERENCE_EXISTS",

                message:
                  "Payout reference is already in use.",
              },
            });
        }

        throw error;
      }
    },
  );
}
