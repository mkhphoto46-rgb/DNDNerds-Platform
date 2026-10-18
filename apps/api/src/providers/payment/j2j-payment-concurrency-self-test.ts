import {
  randomUUID,
} from "node:crypto";

import {
  readFileSync,
  writeFileSync,
} from "node:fs";

import {
  eq,
} from "drizzle-orm";

import {
  db,
  sqlClient,
} from "../../db/client.js";

import {
  marketplaceOrders,
  paymentIntents,
  paymentProviderBindings,
  users,
} from "../../db/schema.js";

import {
  PaymentDomainError,
} from "../../payments/payment-service.js";

import {
  providerConfigPath,
} from "../config/provider-config.js";

import {
  createOrGetProviderPaymentIntent,
} from "./checkout-service.js";

function saveProviders(
  payment: string,
) {
  writeFileSync(
    providerConfigPath(),
    JSON.stringify(
      {
        payment,

        email:
          "development",

        payout:
          "mock",
      },
      null,
      2,
    ) +
      "\n",
    "utf8",
  );
}

async function main() {
  process.env.NODE_ENV =
    "development";

  const configPath =
    providerConfigPath();

  const originalConfig =
    readFileSync(
      configPath,
      "utf8",
    );

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

  let orderId:
    string | null =
    null;

  try {
    const schemaRows =
      await sqlClient<
        Array<{
          column_name: string;
          is_nullable: string;
          column_default: string | null;
        }>
      >`
        SELECT
          column_name,
          is_nullable,
          column_default
        FROM information_schema.columns
        WHERE
          table_schema = 'public'
          AND table_name = 'payment_intents'
          AND column_name IN (
            'provider',
            'provider_intent_id'
          )
        ORDER BY column_name
      `;

    const providerColumn =
      schemaRows.find(
        row =>
          row.column_name ===
          "provider",
      );

    const providerIntentColumn =
      schemaRows.find(
        row =>
          row.column_name ===
          "provider_intent_id",
      );

    if (
      !providerColumn ||
      providerColumn.column_default !==
        null
    ) {
      throw new Error(
        "payment_intents.provider still has a database default.",
      );
    }

    if (
      !providerIntentColumn ||
      providerIntentColumn.is_nullable !==
        "YES"
    ) {
      throw new Error(
        "payment_intents.provider_intent_id is not nullable.",
      );
    }

    const [
      user,
    ] =
      await db
        .insert(
          users,
        )
        .values({
          email:
            `j2j-payment-${suffix}@example.test`,

          status:
            "ACTIVE",

          emailVerified:
            false,
        })
        .returning();

    if (!user) {
      throw new Error(
        "J2J payment self-test user creation failed.",
      );
    }

    userId =
      user.id;

    const [
      order,
    ] =
      await db
        .insert(
          marketplaceOrders,
        )
        .values({
          userId:
            user.id,

          idempotencyKey:
            `j2j-order-${suffix}`,

          customerTotalRial:
            1_450_000,

          platformCommissionRial:
            72_500,

          sellerNetRial:
            1_377_500,

          expiresAt:
            new Date(
              Date.now() +
              15 * 60_000,
            ),
        })
        .returning();

    if (!order) {
      throw new Error(
        "J2J payment self-test order creation failed.",
      );
    }

    orderId =
      order.id;

    saveProviders(
      "mock-secondary",
    );

    const attempts =
      await Promise.allSettled([
        createOrGetProviderPaymentIntent(
          user.id,
          order.id,
          `j2j-intent-a-${suffix}`,
        ),

        createOrGetProviderPaymentIntent(
          user.id,
          order.id,
          `j2j-intent-b-${suffix}`,
        ),
      ]);

    const fulfilled =
      attempts.filter(
        (
          result,
        ): result is
          PromiseFulfilledResult<
            Awaited<
              ReturnType<
                typeof createOrGetProviderPaymentIntent
              >
            >
          > =>
          result.status ===
          "fulfilled",
      );

    const rejected =
      attempts.filter(
        (
          result,
        ): result is
          PromiseRejectedResult =>
          result.status ===
          "rejected",
      );

    if (
      fulfilled.length <
      1
    ) {
      throw new Error(
        "Concurrent payment creation produced no successful request.",
      );
    }

    for (
      const result
      of rejected
    ) {
      const error =
        result.reason;

      if (
        !(
          error instanceof
            PaymentDomainError &&
          error.code ===
            "PAYMENT_PROVIDER_SESSION_BUSY"
        )
      ) {
        throw error;
      }
    }

    const replay =
      await createOrGetProviderPaymentIntent(
        user.id,
        order.id,
        `j2j-intent-replay-${suffix}`,
      );

    const [
      intent,
    ] =
      await db
        .select()
        .from(
          paymentIntents,
        )
        .where(
          eq(
            paymentIntents.orderId,
            order.id,
          ),
        )
        .limit(1);

    if (!intent) {
      throw new Error(
        "Payment intent row was not created.",
      );
    }

    const [
      binding,
    ] =
      await db
        .select()
        .from(
          paymentProviderBindings,
        )
        .where(
          eq(
            paymentProviderBindings
              .paymentIntentId,
            intent.id,
          ),
        )
        .limit(1);

    if (!binding) {
      throw new Error(
        "Payment provider binding was not created.",
      );
    }

    if (
      intent.provider !==
        "mock-secondary" ||
      binding.providerKey !==
        "mock-secondary" ||
      replay.providerSession
        .provider !==
        "mock-secondary"
    ) {
      throw new Error(
        "Payment provider was not pinned to mock-secondary.",
      );
    }

    if (
      !intent.providerIntentId ||
      !binding.providerIntentId ||
      intent.providerIntentId !==
        binding.providerIntentId ||
      replay.providerSession
        .providerIntentId !==
        binding.providerIntentId
    ) {
      throw new Error(
        "Payment provider intent synchronization is inconsistent.",
      );
    }

    if (
      intent.providerIntentId
        .startsWith(
          "mock_pi_",
        )
    ) {
      throw new Error(
        "Legacy mock_pi_ bootstrap placeholder is still being used.",
      );
    }

    const intentRows =
      await db
        .select({
          id:
            paymentIntents.id,
        })
        .from(
          paymentIntents,
        )
        .where(
          eq(
            paymentIntents.orderId,
            order.id,
          ),
        );

    if (
      intentRows.length !==
      1
    ) {
      throw new Error(
        `Concurrent payment creation produced ${intentRows.length} intents instead of exactly one.`,
      );
    }

    console.log(
      JSON.stringify(
        {
          providerDefaultRemoved:
            true,

          providerIntentNullable:
            true,

          concurrentRequests:
            attempts.length,

          fulfilled:
            fulfilled.length,

          busyConflicts:
            rejected.length,

          intentRows:
            intentRows.length,

          provider:
            intent.provider,

          providerIntentSynchronized:
            true,

          legacyBootstrapRemoved:
            true,

          replayReused:
            replay.providerSession
              .reused,
        },
        null,
        2,
      ),
    );
  }
  finally {
    writeFileSync(
      configPath,
      originalConfig,
      "utf8",
    );

    if (orderId) {
      await db
        .delete(
          marketplaceOrders,
        )
        .where(
          eq(
            marketplaceOrders.id,
            orderId,
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
