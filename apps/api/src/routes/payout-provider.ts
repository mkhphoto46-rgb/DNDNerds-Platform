
import type {
  FastifyInstance,
  FastifyRequest,
} from "fastify";

import {
  verify,
} from "@node-rs/argon2";

import {
  and,
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
  financialLedgerPostings,
  financialLedgerTransactions,
  marketplaceAdminAuditLogs,
  marketplaceAdmins,
  payoutProviderAttempts,
  payoutRequestDestinationSnapshots,
  sellerBalances,
  sellerPayoutRequests,
  users,
} from "../db/schema.js";

import {
  decryptPayoutIban,
} from "../finance/payout-destination-crypto.js";

import {
  getGenericPayoutProvider,
} from "../providers/payout/registry.js";

const paramsSchema =
  z.object({
    payoutId:
      z.string()
        .uuid(),
  });

const bodySchema =
  z.object({
    password:
      z.string()
        .min(12)
        .max(128),

    idempotencyKey:
      z.string()
        .trim()
        .min(12)
        .max(180),
  });

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
  payoutId: string,
  details: unknown,
) {
  await db
    .insert(
      marketplaceAdminAuditLogs,
    )
    .values({
      adminUserId,

      action:
        "PAYOUT_PROVIDER_EXECUTE",

      entityType:
        "seller_payout_request",

      entityId:
        payoutId,

      details:
        JSON.stringify(
          details,
        ).slice(
          0,
          1800,
        ),
    });
}

export async function registerPayoutProviderRoutes(
  app: FastifyInstance,
) {
  app.post(
    "/api/v1/admin/marketplace/payouts/:payoutId/execute-provider",
    async (
      request,
      reply,
    ) => {
      const params =
        paramsSchema.safeParse(
          request.params,
        );

      const body =
        bodySchema.safeParse(
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
                "Invalid payout provider request.",
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

      const [
        existingAttempt,
      ] =
        await db
          .select()
          .from(
            payoutProviderAttempts,
          )
          .where(
            eq(
              payoutProviderAttempts.idempotencyKey,
              body.data.idempotencyKey,
            ),
          )
          .limit(1);

      if (
        existingAttempt?.status ===
          "SUCCEEDED" &&
        existingAttempt
          .providerReference
      ) {
        return {
          ok:
            true,

          idempotent:
            true,

          provider:
            existingAttempt.provider,

          providerReference:
            existingAttempt
              .providerReference,

          status:
            "PAID" as const,
        };
      }

      if (
        existingAttempt?.status ===
          "PROCESSING" &&
        existingAttempt
          .providerReference
      ) {
        return reply
          .code(202)
          .send({
            ok:
              true,

            idempotent:
              true,

            provider:
              existingAttempt.provider,

            providerReference:
              existingAttempt
                .providerReference,

            status:
              "PROCESSING" as const,
          });
      }

      if (existingAttempt) {
        return reply
          .code(409)
          .send({
            error: {
              code:
                "PAYOUT_PROVIDER_ATTEMPT_EXISTS",

              message:
                "This idempotency key already has a non-successful attempt.",
            },
          });
      }

      const [
        payout,
      ] =
        await db
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
        payout.status !==
        "APPROVED"
      ) {
        return reply
          .code(409)
          .send({
            error: {
              code:
                "INVALID_PAYOUT_STATE",

              message:
                "Payout must be APPROVED before provider execution.",
            },
          });
      }

      const [
        destinationSnapshot,
      ] =
        await db
          .select()
          .from(
            payoutRequestDestinationSnapshots,
          )
          .where(
            eq(
              payoutRequestDestinationSnapshots.payoutId,
              payout.id,
            ),
          )
          .limit(1);

      if (!destinationSnapshot) {
        return reply
          .code(409)
          .send({
            error: {
              code:
                "PAYOUT_DESTINATION_SNAPSHOT_MISSING",

              message:
                "This payout does not have a pinned payout destination.",
            },
          });
      }

      if (
        destinationSnapshot.method !==
        "IR_IBAN"
      ) {
        return reply
          .code(409)
          .send({
            error: {
              code:
                "PAYOUT_DESTINATION_METHOD_UNSUPPORTED",

              message:
                "The pinned payout destination method is not supported.",
            },
          });
      }

      let destinationIban:
        string;

      try {
        destinationIban =
          decryptPayoutIban({
            ciphertext:
              destinationSnapshot.ibanCiphertext,

            iv:
              destinationSnapshot.ibanIv,

            authTag:
              destinationSnapshot.ibanAuthTag,
          });
      }
      catch {
        return reply
          .code(503)
          .send({
            error: {
              code:
                "PAYOUT_DESTINATION_DECRYPT_FAILED",

              message:
                "The pinned payout destination could not be decrypted safely.",
            },
          });
      }

      const provider =
        getGenericPayoutProvider();

      let attempt:
        typeof payoutProviderAttempts
          .$inferSelect;

      try {
        attempt =
          await db.transaction(
            async (
              tx,
            ) => {
              await tx.execute(
                sql`
                  SELECT pg_advisory_xact_lock(
                    hashtextextended(
                      ${`payout:${payout.id}`},
                      0
                    )
                  )
                `,
              );

              const [
                current,
              ] =
                await tx
                  .select()
                  .from(
                    sellerPayoutRequests,
                  )
                  .where(
                    eq(
                      sellerPayoutRequests.id,
                      payout.id,
                    ),
                  )
                  .limit(1);

              if (
                !current ||
                current.status !==
                  "APPROVED"
              ) {
                throw new Error(
                  "PAYOUT_STATE_CHANGED",
                );
              }

              await tx.execute(
                sql`
                  SELECT pg_advisory_xact_lock(
                    hashtextextended(
                      ${`seller-balance:${current.storeId}`},
                      0
                    )
                  )
                `,
              );

              const [
                balanceBeforeProvider,
              ] =
                await tx
                  .select()
                  .from(
                    sellerBalances,
                  )
                  .where(
                    eq(
                      sellerBalances.storeId,
                      current.storeId,
                    ),
                  )
                  .limit(1);

              if (
                !balanceBeforeProvider ||
                balanceBeforeProvider
                  .negativeRial >
                  0
              ) {
                throw new Error(
                  "SELLER_BALANCE_HAS_CLAWBACK",
                );
              }

              const [
                createdAttempt,
              ] =
                await tx
                  .insert(
                    payoutProviderAttempts,
                  )
                  .values({
                    payoutId:
                      current.id,

                    provider:
                      provider.key,

                    idempotencyKey:
                      body.data.idempotencyKey,

                    status:
                      "CREATED",
                  })
                  .returning();

              if (!createdAttempt) {
                throw new Error(
                  "Payout provider attempt creation failed.",
                );
              }

              await tx
                .update(
                  sellerPayoutRequests,
                )
                .set({
                  status:
                    "PROCESSING",

                  updatedAt:
                    new Date(),
                })
                .where(
                  eq(
                    sellerPayoutRequests.id,
                    current.id,
                  ),
                );

              return createdAttempt;
            },
          );
      }
      catch (error) {
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
                  "Payout provider execution is blocked until the negative seller balance is recovered.",
              },
            });
        }

        if (
          error instanceof Error &&
          error.message ===
            "PAYOUT_STATE_CHANGED"
        ) {
          return reply
            .code(409)
            .send({
              error: {
                code:
                  "PAYOUT_STATE_CHANGED",

                message:
                  "Payout state changed before provider execution could be claimed.",
              },
            });
        }

        throw error;
      }

      let providerResult:
        Awaited<
          ReturnType<
            typeof provider.createPayout
          >
        >;

      try {
        providerResult =
          await provider.createPayout({
            payoutId:
              payout.id,

            storeId:
              payout.storeId,

            amountRial:
              payout.amountRial,

            idempotencyKey:
              body.data.idempotencyKey,

            destination: {
              method:
                destinationSnapshot.method,

              iban:
                destinationIban,

              accountHolderName:
                destinationSnapshot.accountHolderName,
            },
          });
      }
      catch (error) {
        await db.transaction(
          async (
            tx,
          ) => {
            await tx
              .update(
                payoutProviderAttempts,
              )
              .set({
                status:
                  "FAILED",

                failureReason:
                  error instanceof Error
                    ? error.message
                    : "Unknown provider error",

                updatedAt:
                  new Date(),
              })
              .where(
                eq(
                  payoutProviderAttempts.id,
                  attempt.id,
                ),
              );

            await tx
              .update(
                sellerPayoutRequests,
              )
              .set({
                status:
                  "APPROVED",

                updatedAt:
                  new Date(),
              })
              .where(
                and(
                  eq(
                    sellerPayoutRequests.id,
                    payout.id,
                  ),

                  eq(
                    sellerPayoutRequests.status,
                    "PROCESSING",
                  ),
                ),
              );
          },
        );

        return reply
          .code(502)
          .send({
            error: {
              code:
                "PAYOUT_PROVIDER_ERROR",

              message:
                error instanceof Error
                  ? error.message
                  : "Payout provider failed.",
            },
          });
      }

      if (
        providerResult.status ===
        "FAILED"
      ) {
        await db.transaction(
          async (
            tx,
          ) => {
            await tx
              .update(
                payoutProviderAttempts,
              )
              .set({
                status:
                  "FAILED",

                failureReason:
                  "Provider returned FAILED.",

                providerReference:
                  providerResult
                    .providerReference,

                updatedAt:
                  new Date(),
              })
              .where(
                eq(
                  payoutProviderAttempts.id,
                  attempt.id,
                ),
              );

            await tx
              .update(
                sellerPayoutRequests,
              )
              .set({
                status:
                  "APPROVED",

                updatedAt:
                  new Date(),
              })
              .where(
                and(
                  eq(
                    sellerPayoutRequests.id,
                    payout.id,
                  ),

                  eq(
                    sellerPayoutRequests.status,
                    "PROCESSING",
                  ),
                ),
              );
          },
        );

        return reply
          .code(502)
          .send({
            error: {
              code:
                "PAYOUT_PROVIDER_FAILED",

              message:
                "Payout provider returned a failed result.",
            },
          });
      }

      if (
        providerResult.status ===
        "PROCESSING"
      ) {
        const now =
          new Date();

        await db.transaction(
          async (
            tx,
          ) => {
            await tx
              .update(
                sellerPayoutRequests,
              )
              .set({
                status:
                  "PROCESSING",

                payoutReference:
                  providerResult
                    .providerReference,

                updatedAt:
                  now,
              })
              .where(
                eq(
                  sellerPayoutRequests.id,
                  payout.id,
                ),
              );

            await tx
              .update(
                payoutProviderAttempts,
              )
              .set({
                status:
                  "PROCESSING",

                providerReference:
                  providerResult
                    .providerReference,

                updatedAt:
                  now,
              })
              .where(
                eq(
                  payoutProviderAttempts.id,
                  attempt.id,
                ),
              );
          },
        );

        await audit(
          admin.userId,
          payout.id,
          {
            provider:
              providerResult.provider,

            providerReference:
              providerResult
                .providerReference,

            amountRial:
              payout.amountRial,

            status:
              "PROCESSING",
          },
        );

        return reply
          .code(202)
          .send({
            ok:
              true,

            idempotent:
              false,

            status:
              "PROCESSING",

            provider:
              providerResult.provider,

            providerReference:
              providerResult
                .providerReference,

            amountRial:
              payout.amountRial,

            source:
              "postgresql" as const,
          });
      }

      const result =
        await db.transaction(
          async (
            tx,
          ) => {
            const [
              current,
            ] =
              await tx
                .select()
                .from(
                  sellerPayoutRequests,
                )
                .where(
                  eq(
                    sellerPayoutRequests.id,
                    payout.id,
                  ),
                )
                .limit(1);

            if (
              !current ||
              current.status !==
                "PROCESSING"
            ) {
              throw new Error(
                "PAYOUT_STATE_CHANGED",
              );
            }

            await tx.execute(
              sql`
                SELECT pg_advisory_xact_lock(
                  hashtextextended(
                    ${`seller-balance:${current.storeId}`},
                    0
                  )
                )
              `,
            );

            const [
              currentBalance,
            ] =
              await tx
                .select()
                .from(
                  sellerBalances,
                )
                .where(
                  eq(
                    sellerBalances.storeId,
                    current.storeId,
                  ),
                )
                .limit(1);

            if (!currentBalance) {
              throw new Error(
                "SELLER_BALANCE_NOT_FOUND",
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
                  sql`${sellerBalances.paidOutRial} + ${current.amountRial}`,

                updatedAt:
                  now,
              })
              .where(
                eq(
                  sellerBalances.storeId,
                  current.storeId,
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
                    `provider-payout:${current.id}`,
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
                    current.storeId,

                  amountRial:
                    current.amountRial,
                },

                {
                  transactionId:
                    ledger.id,

                  accountCode:
                    "PLATFORM_CASH",

                  storeId:
                    null,

                  amountRial:
                    -current.amountRial,
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
                  providerResult
                    .providerReference,

                paidAt:
                  now,

                updatedAt:
                  now,
              })
              .where(
                eq(
                  sellerPayoutRequests.id,
                  current.id,
                ),
              );

            await tx
              .update(
                payoutProviderAttempts,
              )
              .set({
                status:
                  "SUCCEEDED",

                providerReference:
                  providerResult
                    .providerReference,

                updatedAt:
                  now,
              })
              .where(
                eq(
                  payoutProviderAttempts.id,
                  attempt.id,
                ),
              );

            return {
              status:
                "PAID" as const,

              provider:
                providerResult.provider,

              providerReference:
                providerResult
                  .providerReference,

              amountRial:
                current.amountRial,
            };
          },
        );

      await audit(
        admin.userId,
        payout.id,
        {
          provider:
            result.provider,

          providerReference:
            result.providerReference,

          amountRial:
            result.amountRial,
        },
      );

      return {
        ok:
          true,

        idempotent:
          false,

        ...result,

        source:
          "postgresql" as const,
      };
    },
  );
}
