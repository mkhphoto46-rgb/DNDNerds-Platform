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
  paymentWebhookEvents,
  users,
} from "../../db/schema.js";

import {
  PaymentDomainError,
  processProviderWebhook,
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
    Date.now()
      .toString(
        36,
      );

  let userId:
    string | null =
    null;

  let testEventId:
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
            `j2c-${suffix}@example.test`,
        })
        .returning();

    if (!user) {
      throw new Error(
        "Self-test user creation failed.",
      );
    }

    userId =
      user.id;

    const makeOrder =
      async (
        key: string,
      ) => {
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
                key,

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
            "Self-test order creation failed.",
          );
        }

        return order;
      };

    saveProviders(
      "mock",
    );

    const orderA =
      await makeOrder(
        `j2c-order-a-${suffix}`,
      );

    const first =
      await createOrGetProviderPaymentIntent(
        user.id,
        orderA.id,
        `j2c-intent-a-${suffix}`,
      );

    if (
      first.intent.provider !==
        "mock" ||
      first.providerSession
        .provider !==
        "mock"
    ) {
      throw new Error(
        "First payment did not use mock.",
      );
    }

    const [
      bindingA,
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
            first.intent.id,
          ),
        )
        .limit(
          1,
        );

    if (
      !bindingA ||
      bindingA.providerKey !==
        "mock"
    ) {
      throw new Error(
        "First provider binding is invalid.",
      );
    }

    saveProviders(
      "mock-secondary",
    );

    const replay =
      await createOrGetProviderPaymentIntent(
        user.id,
        orderA.id,
        `j2c-intent-a-${suffix}`,
      );

    if (
      replay.intent.provider !==
        "mock" ||
      replay.providerSession
        .provider !==
        "mock"
    ) {
      throw new Error(
        "Existing payment intent was not pinned to its original provider.",
      );
    }

    const orderB =
      await makeOrder(
        `j2c-order-b-${suffix}`,
      );

    const second =
      await createOrGetProviderPaymentIntent(
        user.id,
        orderB.id,
        `j2c-intent-b-${suffix}`,
      );

    if (
      second.intent.provider !==
        "mock-secondary" ||
      second.providerSession
        .provider !==
        "mock-secondary"
    ) {
      throw new Error(
        "Second payment did not use mock-secondary.",
      );
    }

    const [
      bindingB,
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
            second.intent.id,
          ),
        )
        .limit(
          1,
        );

    if (
      !bindingB ||
      bindingB.providerKey !==
        "mock-secondary"
    ) {
      throw new Error(
        "Second provider binding is invalid.",
      );
    }

    const eventId =
      `j2c-event-${suffix}`;

    testEventId =
      eventId;

    const event = {
      eventId,

      type:
        "payment.failed" as const,

      intentId:
        second.intent.id,

      errorCode:
        "J2C_SELF_TEST_FAILURE",
    };

    const canonical =
      JSON.stringify(
        event,
      );

    const failed =
      await processProviderWebhook(
        "mock-secondary",
        event,
        canonical,
      );

    if (
      failed.status !==
      "FAILED" ||
      failed.idempotent
    ) {
      throw new Error(
        "Generic provider failure event was not processed.",
      );
    }

    const duplicate =
      await processProviderWebhook(
        "mock-secondary",
        event,
        canonical,
      );

    if (
      !duplicate.idempotent
    ) {
      throw new Error(
        "Duplicate provider event was not idempotent.",
      );
    }

    let payloadConflict =
      false;

    try {
      await processProviderWebhook(
        "mock-secondary",
        {
          ...event,
          errorCode:
            "CHANGED_PAYLOAD",
        },
        JSON.stringify({
          ...event,
          errorCode:
            "CHANGED_PAYLOAD",
        }),
      );
    }
    catch (error) {
      if (
        error instanceof
          PaymentDomainError &&
        error.code ===
          "WEBHOOK_EVENT_PAYLOAD_CONFLICT"
      ) {
        payloadConflict =
          true;
      }
      else {
        throw error;
      }
    }

    if (!payloadConflict) {
      throw new Error(
        "Changed payload with duplicate provider event id was not rejected.",
      );
    }

    let providerMismatch =
      false;

    try {
      await processProviderWebhook(
        "mock",
        {
          eventId:
            `j2c-mismatch-${suffix}`,

          type:
            "payment.failed",

          intentId:
            second.intent.id,

          errorCode:
            "MISMATCH",
        },
        JSON.stringify({
          eventId:
            `j2c-mismatch-${suffix}`,

          type:
            "payment.failed",

          intentId:
            second.intent.id,

          errorCode:
            "MISMATCH",
        }),
      );
    }
    catch (error) {
      if (
        error instanceof
          PaymentDomainError &&
        error.code ===
          "PAYMENT_PROVIDER_MISMATCH"
      ) {
        providerMismatch =
          true;
      }
      else {
        throw error;
      }
    }

    if (!providerMismatch) {
      throw new Error(
        "Provider mismatch was not rejected.",
      );
    }

    const [
      storedIntentB,
    ] =
      await db
        .select()
        .from(
          paymentIntents,
        )
        .where(
          eq(
            paymentIntents.id,
            second.intent.id,
          ),
        )
        .limit(
          1,
        );

    if (
      !storedIntentB ||
      storedIntentB.status !==
        "FAILED"
    ) {
      throw new Error(
        "Generic provider failure status was not persisted.",
      );
    }

    const webhookRows =
      await db
        .select()
        .from(
          paymentWebhookEvents,
        )
        .where(
          eq(
            paymentWebhookEvents.provider,
            "mock-secondary",
          ),
        );

    if (
      webhookRows.filter(
        row =>
          row.providerEventId ===
          eventId,
      ).length !==
      1
    ) {
      throw new Error(
        "Provider event idempotency row count is invalid.",
      );
    }

    console.log(
      JSON.stringify(
        {
          firstProvider:
            first.intent.provider,

          pinnedAfterSwitch:
            replay.intent.provider,

          secondProvider:
            second.intent.provider,

          providerBinding:
            true,

          providerMismatchRejected:
            true,

          duplicateEventIdempotent:
            true,

          changedPayloadRejected:
            true,

          genericFailurePersisted:
            true,
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

    if (testEventId) {
      await db
        .delete(
          paymentWebhookEvents,
        )
        .where(
          eq(
            paymentWebhookEvents
              .providerEventId,
            testEventId,
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

main().catch(
  async error => {
    console.error(
      error,
    );

    try {
      await sqlClient.end({
        timeout:
          5,
      });
    }
    catch {
    }

    process.exit(
      1,
    );
  },
);
