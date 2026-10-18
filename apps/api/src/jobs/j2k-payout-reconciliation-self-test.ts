import {
  createHash,
  randomUUID,
} from "node:crypto";

import {
  eq,
} from "drizzle-orm";

import {
  db,
  sqlClient,
} from "../db/client.js";

import {
  financialLedgerTransactions,
  payoutProviderAttempts,
  sellerBalances,
  sellerPayoutRequests,
  sellerProfiles,
  stores,
  users,
} from "../db/schema.js";

import {
  reconcilePayoutAttempt,
} from "../payouts/reconciliation.js";

async function cleanupLeakedPayoutFixtures() {
  await sqlClient`
    DELETE FROM financial_ledger_transactions
    WHERE idempotency_key IN (
      SELECT
        'provider-payout:' ||
        payout.id::text
      FROM seller_payout_requests
        AS payout
      INNER JOIN users
        AS account
        ON account.id =
          payout.requested_by_user_id
      WHERE account.email LIKE
        'j2k-payout-%@example.test'
    )
  `;

  await sqlClient`
    DELETE FROM seller_payout_requests
    WHERE requested_by_user_id IN (
      SELECT id
      FROM users
      WHERE email LIKE
        'j2k-payout-%@example.test'
    )
  `;

  await sqlClient`
    DELETE FROM users
    WHERE email LIKE
      'j2k-payout-%@example.test'
  `;
}

async function main() {
  await cleanupLeakedPayoutFixtures();

  const suffix =
    randomUUID()
      .replace(
        /-/g,
        "",
      )
      .slice(
        0,
        16,
      );

  let userId:
    string | null =
    null;

  let payoutId:
    string | null =
    null;

  try {
    const [
      user,
    ] =
      await db
        .insert(
          users,
        )
        .values({
          email:
            `j2k-payout-${suffix}@example.test`,

          status:
            "ACTIVE",

          emailVerified:
            false,
        })
        .returning();

    if (!user) {
      throw new Error(
        "J2K payout user creation failed.",
      );
    }

    userId =
      user.id;

    const [
      seller,
    ] =
      await db
        .insert(
          sellerProfiles,
        )
        .values({
          userId:
            user.id,

          displayName:
            `J2K Payout Seller ${suffix}`,

          status:
            "ACTIVE",
        })
        .returning();

    if (!seller) {
      throw new Error(
        "J2K payout seller creation failed.",
      );
    }

    const [
      store,
    ] =
      await db
        .insert(
          stores,
        )
        .values({
          sellerProfileId:
            seller.id,

          slug:
            `j2k-payout-${suffix}`,

          name:
            `J2K Payout Store ${suffix}`,

          category:
            "test",

          status:
            "ACTIVE",

          verified:
            true,
        })
        .returning();

    if (!store) {
      throw new Error(
        "J2K payout store creation failed.",
      );
    }

    await db
      .insert(
        sellerBalances,
      )
      .values({
        storeId:
          store.id,

        pendingRial:
          0,

        availableRial:
          0,

        negativeRial:
          0,

        paidOutRial:
          0,
      });

    const amountRial =
      20_000;

    const [
      payout,
    ] =
      await db
        .insert(
          sellerPayoutRequests,
        )
        .values({
          storeId:
            store.id,

          requestedByUserId:
            user.id,

          amountRial,

          status:
            "PROCESSING",

          updatedAt:
            new Date(),
        })
        .returning();

    if (!payout) {
      throw new Error(
        "J2K payout request creation failed.",
      );
    }

    payoutId =
      payout.id;

    const idempotencyKey =
      `j2k-payout-key-${suffix}`;

    const providerReference =
      "mock_payout_" +
      createHash(
        "sha256",
      )
        .update(
          idempotencyKey,
          "utf8",
        )
        .digest(
          "hex",
        )
        .slice(
          0,
          24,
        );

    const [
      attempt,
    ] =
      await db
        .insert(
          payoutProviderAttempts,
        )
        .values({
          payoutId:
            payout.id,

          provider:
            "mock",

          idempotencyKey,

          status:
            "PROCESSING",

          providerReference,
        })
        .returning();

    if (!attempt) {
      throw new Error(
        "J2K payout attempt creation failed.",
      );
    }

    const first =
      await reconcilePayoutAttempt(
        attempt.id,
      );

    if (
      first.outcome !==
      "SUCCEEDED"
    ) {
      throw new Error(
        `Payout reconciliation did not succeed: ${first.outcome}`,
      );
    }

    const replay =
      await reconcilePayoutAttempt(
        attempt.id,
      );

    if (
      replay.outcome !==
        "SUCCEEDED" ||
      !(
        "idempotent"
        in replay
      ) ||
      replay.idempotent !==
        true
    ) {
      throw new Error(
        "Payout reconciliation replay was not idempotent.",
      );
    }

    const [
      finalPayout,
    ] =
      await db
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

    const [
      finalAttempt,
    ] =
      await db
        .select()
        .from(
          payoutProviderAttempts,
        )
        .where(
          eq(
            payoutProviderAttempts.id,
            attempt.id,
          ),
        )
        .limit(1);

    const [
      finalBalance,
    ] =
      await db
        .select()
        .from(
          sellerBalances,
        )
        .where(
          eq(
            sellerBalances.storeId,
            store.id,
          ),
        )
        .limit(1);

    const ledgerRows =
      await db
        .select()
        .from(
          financialLedgerTransactions,
        )
        .where(
          eq(
            financialLedgerTransactions.idempotencyKey,
            `provider-payout:${payout.id}`,
          ),
        );

    if (
      finalPayout?.status !==
        "PAID" ||
      finalPayout.payoutReference !==
        providerReference
    ) {
      throw new Error(
        "Payout request was not finalized correctly.",
      );
    }

    if (
      finalAttempt?.status !==
        "SUCCEEDED" ||
      finalAttempt.providerReference !==
        providerReference
    ) {
      throw new Error(
        "Payout provider attempt was not finalized correctly.",
      );
    }

    if (
      finalBalance?.paidOutRial !==
      amountRial
    ) {
      throw new Error(
        "Seller paidOutRial was not incremented exactly once.",
      );
    }

    if (
      ledgerRows.length !==
      1
    ) {
      throw new Error(
        `Expected one payout ledger transaction, found ${ledgerRows.length}.`,
      );
    }

    console.log(
      JSON.stringify(
        {
          firstOutcome:
            first.outcome,

          replayIdempotent:
            true,

          payoutStatus:
            finalPayout.status,

          attemptStatus:
            finalAttempt.status,

          paidOutRial:
            finalBalance.paidOutRial,

          payoutLedgerCount:
            ledgerRows.length,
        },
        null,
        2,
      ),
    );
  }
  finally {
    if (payoutId) {
      await db
        .delete(
          financialLedgerTransactions,
        )
        .where(
          eq(
            financialLedgerTransactions.idempotencyKey,
            `provider-payout:${payoutId}`,
          ),
        );

      await db
        .delete(
          sellerPayoutRequests,
        )
        .where(
          eq(
            sellerPayoutRequests.id,
            payoutId,
          ),
        );
    }

    if (userId) {
      await db
        .delete(
          users,
        )
        .where(
          eq(
            users.id,
            userId,
          ),
        );
    }

    await sqlClient.end({
      timeout:
        5,
    });
  }
}

main()
  .then(
    () => {
      process.exit(
        0,
      );
    },
  )
  .catch(
    error => {
      console.error(
        error,
      );

      process.exit(
        1,
      );
    },
  );
