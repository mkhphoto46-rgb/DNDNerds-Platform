import {
  and,
  eq,
  inArray,
  sql,
} from "drizzle-orm";

import {
  db,
} from "../db/client.js";

import {
  financialLedgerPostings,
  financialLedgerTransactions,
  payoutProviderAttempts,
  sellerBalances,
  sellerPayoutRequests,
} from "../db/schema.js";

import {
  getGenericPayoutProvider,
} from "../providers/payout/registry.js";

export async function finalizeSucceededPayout(
  payoutId: string,
  attemptId: string,
  providerReference: string,
) {
  return db.transaction(
    async (
      tx,
    ) => {
      await tx.execute(
        sql`
          SELECT pg_advisory_xact_lock(
            hashtextextended(
              ${`payout:${payoutId}`},
              0
            )
          )
        `,
      );

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
              payoutId,
            ),
          )
          .limit(1);

      if (!payout) {
        throw new Error(
          "PAYOUT_NOT_FOUND",
        );
      }

      const [
        attempt,
      ] =
        await tx
          .select()
          .from(
            payoutProviderAttempts,
          )
          .where(
            and(
              eq(
                payoutProviderAttempts.id,
                attemptId,
              ),

              eq(
                payoutProviderAttempts.payoutId,
                payout.id,
              ),
            ),
          )
          .limit(1);

      if (!attempt) {
        throw new Error(
          "PAYOUT_PROVIDER_ATTEMPT_NOT_FOUND",
        );
      }

      if (
        payout.status ===
        "PAID"
      ) {
        if (
          attempt.status !==
          "SUCCEEDED"
        ) {
          await tx
            .update(
              payoutProviderAttempts,
            )
            .set({
              status:
                "SUCCEEDED",

              providerReference,

              failureReason:
                null,

              updatedAt:
                new Date(),
            })
            .where(
              eq(
                payoutProviderAttempts.id,
                attempt.id,
              ),
            );
        }

        return {
          status:
            "PAID" as const,

          idempotent:
            true,

          payoutId:
            payout.id,

          provider:
            attempt.provider,

          providerReference:
            payout.payoutReference ??
            providerReference,
        };
      }

      if (
        payout.status !==
        "PROCESSING"
      ) {
        throw new Error(
          "PAYOUT_NOT_PROCESSING",
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

      if (!balance) {
        throw new Error(
          "SELLER_BALANCE_NOT_FOUND",
        );
      }

      const ledgerKey =
        `provider-payout:${payout.id}`;

      const [
        insertedLedger,
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
              ledgerKey,
          })
          .onConflictDoNothing()
          .returning({
            id:
              financialLedgerTransactions.id,
          });

      const now =
        new Date();

      if (insertedLedger) {
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

        await tx
          .insert(
            financialLedgerPostings,
          )
          .values([
            {
              transactionId:
                insertedLedger.id,

              accountCode:
                "SELLER_PAYABLE",

              storeId:
                payout.storeId,

              amountRial:
                payout.amountRial,
            },

            {
              transactionId:
                insertedLedger.id,

              accountCode:
                "PLATFORM_CASH",

              storeId:
                null,

              amountRial:
                -payout.amountRial,
            },
          ]);
      }

      await tx
        .update(
          sellerPayoutRequests,
        )
        .set({
          status:
            "PAID",

          payoutReference:
            providerReference,

          paidAt:
            payout.paidAt ??
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

      await tx
        .update(
          payoutProviderAttempts,
        )
        .set({
          status:
            "SUCCEEDED",

          providerReference,

          failureReason:
            null,

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

        idempotent:
          !insertedLedger,

        payoutId:
          payout.id,

        provider:
          attempt.provider,

        providerReference,
      };
    },
  );
}

export async function markPayoutProviderFailed(
  payoutId: string,
  attemptId: string,
  providerReference: string | null,
  failureReason: string,
) {
  return db.transaction(
    async (
      tx,
    ) => {
      await tx.execute(
        sql`
          SELECT pg_advisory_xact_lock(
            hashtextextended(
              ${`payout:${payoutId}`},
              0
            )
          )
        `,
      );

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
              payoutId,
            ),
          )
          .limit(1);

      if (!payout) {
        throw new Error(
          "PAYOUT_NOT_FOUND",
        );
      }

      if (
        payout.status ===
        "PAID"
      ) {
        return {
          status:
            "PAID" as const,

          idempotent:
            true,
        };
      }

      const now =
        new Date();

      await tx
        .update(
          payoutProviderAttempts,
        )
        .set({
          status:
            "FAILED",

          providerReference:
            providerReference,

          failureReason:
            failureReason.slice(
              0,
              500,
            ),

          updatedAt:
            now,
        })
        .where(
          and(
            eq(
              payoutProviderAttempts.id,
              attemptId,
            ),

            eq(
              payoutProviderAttempts.payoutId,
              payout.id,
            ),
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
            now,
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

      return {
        status:
          "FAILED" as const,

        idempotent:
          false,
      };
    },
  );
}

export async function reconcilePayoutAttempt(
  attemptId: string,
) {
  const [
    attempt,
  ] =
    await db
      .select()
      .from(
        payoutProviderAttempts,
      )
      .where(
        eq(
          payoutProviderAttempts.id,
          attemptId,
        ),
      )
      .limit(1);

  if (!attempt) {
    return {
      outcome:
        "NOT_FOUND" as const,
    };
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
          attempt.payoutId,
        ),
      )
      .limit(1);

  if (!payout) {
    return {
      outcome:
        "PAYOUT_NOT_FOUND" as const,

      attemptId:
        attempt.id,
    };
  }

  if (
    attempt.status ===
      "SUCCEEDED" ||
    payout.status ===
      "PAID"
  ) {
    return {
      outcome:
        "SUCCEEDED" as const,

      attemptId:
        attempt.id,

      payoutId:
        payout.id,

      idempotent:
        true,
    };
  }

  if (
    attempt.status ===
    "FAILED"
  ) {
    return {
      outcome:
        "FAILED" as const,

      attemptId:
        attempt.id,

      payoutId:
        payout.id,

      idempotent:
        true,
    };
  }

  if (
    !attempt.providerReference
  ) {
    return {
      outcome:
        "MANUAL_REVIEW_REQUIRED" as const,

      reason:
        "Provider reference is missing. Automatic replay is intentionally blocked to avoid a duplicate payout.",

      attemptId:
        attempt.id,

      payoutId:
        payout.id,
    };
  }

  const provider =
    getGenericPayoutProvider(
      attempt.provider,
    );

  if (
    !provider.queryPayout
  ) {
    return {
      outcome:
        "STATUS_QUERY_UNSUPPORTED" as const,

      attemptId:
        attempt.id,

      payoutId:
        payout.id,

      provider:
        provider.key,
    };
  }

  const result =
    await provider
      .queryPayout({
        payoutId:
          payout.id,

        storeId:
          payout.storeId,

        amountRial:
          payout.amountRial,

        providerReference:
          attempt.providerReference,
      });

  if (
    result.provider !==
    attempt.provider
  ) {
    return {
      outcome:
        "PROVIDER_MISMATCH" as const,

      attemptId:
        attempt.id,

      payoutId:
        payout.id,
    };
  }

  if (
    result.providerReference !==
    attempt.providerReference
  ) {
    return {
      outcome:
        "REFERENCE_MISMATCH" as const,

      attemptId:
        attempt.id,

      payoutId:
        payout.id,
    };
  }

  if (
    result.status ===
    "PROCESSING"
  ) {
    return {
      outcome:
        "PROCESSING" as const,

      attemptId:
        attempt.id,

      payoutId:
        payout.id,
    };
  }

  if (
    result.status ===
    "FAILED"
  ) {
    await markPayoutProviderFailed(
      payout.id,
      attempt.id,
      attempt.providerReference,
      result.failureReason ??
        "Provider status query returned FAILED.",
    );

    return {
      outcome:
        "FAILED" as const,

      attemptId:
        attempt.id,

      payoutId:
        payout.id,

      idempotent:
        false,
    };
  }

  const finalized =
    await finalizeSucceededPayout(
      payout.id,
      attempt.id,
      attempt.providerReference,
    );

  return {
    outcome:
      "SUCCEEDED" as const,

    attemptId:
      attempt.id,

    payoutId:
      payout.id,

    idempotent:
      finalized.idempotent,
  };
}

export async function reconcileProcessingPayouts(
  limit = 50,
) {
  const safeLimit =
    Math.max(
      1,
      Math.min(
        250,
        Math.trunc(
          limit,
        ),
      ),
    );

  const attempts =
    await db
      .select({
        id:
          payoutProviderAttempts.id,
      })
      .from(
        payoutProviderAttempts,
      )
      .where(
        inArray(
          payoutProviderAttempts.status,
          [
            "CREATED",
            "PROCESSING",
          ],
        ),
      )
      .limit(
        safeLimit,
      );

  const summary = {
    scanned:
      attempts.length,

    succeeded:
      0,

    processing:
      0,

    failed:
      0,

    manualReview:
      0,

    unsupported:
      0,

    other:
      0,
  };

  for (
    const attempt
    of attempts
  ) {
    const result =
      await reconcilePayoutAttempt(
        attempt.id,
      );

    switch (
      result.outcome
    ) {
      case "SUCCEEDED":
        summary.succeeded +=
          1;
        break;

      case "PROCESSING":
        summary.processing +=
          1;
        break;

      case "FAILED":
        summary.failed +=
          1;
        break;

      case "MANUAL_REVIEW_REQUIRED":
        summary.manualReview +=
          1;
        break;

      case "STATUS_QUERY_UNSUPPORTED":
        summary.unsupported +=
          1;
        break;

      default:
        summary.other +=
          1;
        break;
    }
  }

  return summary;
}
