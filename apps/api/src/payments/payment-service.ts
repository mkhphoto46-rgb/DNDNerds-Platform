import {
  createHash,
  randomUUID,
} from "node:crypto";

import {
  and,
  eq,
  inArray,
  lte,
  sql,
} from "drizzle-orm";

import {
  db,
} from "../db/client.js";

import {
  applyRefundClawback,
} from "../finance/seller-balance-policy.js";

import { enqueueSellerOrderPaidInTransaction } from "../notifications/producer.js";

import {
  RefundProviderUncertainError,
} from "../providers/contracts/refund-provider.js";

import {
  findRefundProvider,
} from "../providers/refund/registry.js";

import {
  financialLedgerPostings,
  financialLedgerTransactions,
  inventory,
  inventoryReservations,
  marketplaceOrderItems,
  marketplaceOrders,
  marketplaceSellerOrders,
  paymentIntents,
  paymentProviderBindings,
  paymentWebhookEvents,
  payments,
  refunds,
  sellerBalances,
} from "../db/schema.js";

export class PaymentDomainError
  extends Error {
  public readonly statusCode:
    number;

  public readonly code:
    string;

  public readonly details?:
    unknown;

  constructor(
    statusCode: number,
    code: string,
    message: string,
    details?: unknown,
  ) {
    super(message);

    this.name =
      "PaymentDomainError";

    this.statusCode =
      statusCode;

    this.code =
      code;

    this.details =
      details;
  }
}

export type MockWebhookEvent = {
  eventId: string;
  type:
    | "payment.succeeded"
    | "payment.failed";
  intentId: string;
  providerPaymentId?: string;
  errorCode?: string;
};

function payloadHash(
  payload: string,
) {
  return createHash(
    "sha256",
  )
    .update(payload)
    .digest("hex");
}

function assertBalanced(
  values: number[],
) {
  const total =
    values.reduce(
      (
        sum,
        value,
      ) =>
        sum +
        value,
      0,
    );

  if (total !== 0) {
    throw new Error(
      `Ledger transaction is unbalanced: ${total}`,
    );
  }
}

export async function createOrGetPaymentIntent(
  userId: string,
  orderId: string,
  idempotencyKey: string,
  providerKey: string,
) {
  const normalizedProviderKey =
    providerKey
      .trim()
      .toLowerCase();

  if (!normalizedProviderKey) {
    throw new Error(
      "Payment provider key cannot be empty.",
    );
  }

  return db.transaction(
    async (
      tx,
    ) => {
      await tx.execute(
        sql`
          SELECT pg_advisory_xact_lock(
            hashtextextended(
              ${`payment-intent-order:${orderId}`},
              0
            )
          )
        `,
      );

      await tx.execute(
        sql`
          SELECT pg_advisory_xact_lock(
            hashtextextended(
              ${`payment-intent-key:${idempotencyKey}`},
              0
            )
          )
        `,
      );

      const [
        order,
      ] =
        await tx
          .select()
          .from(
            marketplaceOrders,
          )
          .where(
            and(
              eq(
                marketplaceOrders.id,
                orderId,
              ),

              eq(
                marketplaceOrders.userId,
                userId,
              ),
            ),
          )
          .limit(1);

      if (!order) {
        throw new PaymentDomainError(
          404,
          "ORDER_NOT_FOUND",
          "Order was not found.",
        );
      }

      if (
        order.status !==
        "PENDING_PAYMENT"
      ) {
        throw new PaymentDomainError(
          409,
          "ORDER_NOT_PAYABLE",
          "Only pending-payment orders can create a payment intent.",
          {
            status:
              order.status,
          },
        );
      }

      if (
        order.expiresAt.getTime() <=
        Date.now()
      ) {
        throw new PaymentDomainError(
          409,
          "ORDER_EXPIRED",
          "Order reservation has expired.",
        );
      }

      const [
        existingForOrder,
      ] =
        await tx
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

      if (existingForOrder) {
        return {
          intent:
            existingForOrder,

          idempotent:
            true,
        };
      }

      const [
        existingKey,
      ] =
        await tx
          .select()
          .from(
            paymentIntents,
          )
          .where(
            eq(
              paymentIntents.idempotencyKey,
              idempotencyKey,
            ),
          )
          .limit(1);

      if (existingKey) {
        throw new PaymentDomainError(
          409,
          "IDEMPOTENCY_KEY_CONFLICT",
          "Payment idempotency key was already used for another order.",
        );
      }

      const [
        created,
      ] =
        await tx
          .insert(
            paymentIntents,
          )
          .values({
            orderId:
              order.id,

            provider:
              normalizedProviderKey,

            providerIntentId:
              null,

            status:
              "REQUIRES_PAYMENT",

            amountRial:
              order.customerTotalRial,

            currency:
              order.currency,

            idempotencyKey,

            expiresAt:
              order.expiresAt,

            updatedAt:
              new Date(),
          })
          .returning();

      if (!created) {
        throw new Error(
          "Payment intent creation failed.",
        );
      }

      return {
        intent:
          created,

        idempotent:
          false,
      };
    },
  );
}

export async function getPaymentSummary(
  userId: string,
  orderId: string,
) {
  const [
    order,
  ] =
    await db
      .select({
        id:
          marketplaceOrders.id,

        status:
          marketplaceOrders.status,

        amountRial:
          marketplaceOrders.customerTotalRial,

        currency:
          marketplaceOrders.currency,
      })
      .from(
        marketplaceOrders,
      )
      .where(
        and(
          eq(
            marketplaceOrders.id,
            orderId,
          ),

          eq(
            marketplaceOrders.userId,
            userId,
          ),
        ),
      )
      .limit(1);

  if (!order) {
    return null;
  }

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

  const [
    providerBinding,
  ] =
    intent
      ? await db
          .select()
          .from(
            paymentProviderBindings,
          )
          .where(
            eq(
              paymentProviderBindings.paymentIntentId,
              intent.id,
            ),
          )
          .limit(1)
      : [];

  const [
    payment,
  ] =
    await db
      .select()
      .from(
        payments,
      )
      .where(
        eq(
          payments.orderId,
          order.id,
        ),
      )
      .limit(1);

  const refundRows =
    await db
      .select()
      .from(
        refunds,
      )
      .where(
        eq(
          refunds.orderId,
          order.id,
        ),
      );

  return {
    order,

    intent:
      intent ??
      null,

    providerBinding:
      providerBinding ??
      null,

    payment:
      payment ??
      null,

    refunds:
      refundRows,

    source:
      "postgresql" as const,
  };
}

export async function processProviderWebhook(
  provider: string,
  event: MockWebhookEvent,
  canonicalPayload: string,
) {
  return db.transaction(
    async (
      tx,
    ) => {
      const eventPayloadHash =
        payloadHash(
          canonicalPayload,
        );

      const insertedEvents =
        await tx
          .insert(
            paymentWebhookEvents,
          )
          .values({
            provider,

            providerEventId:
              event.eventId,

            eventType:
              event.type,

            payloadHash:
              eventPayloadHash,
          })
          .onConflictDoNothing()
          .returning({
            id:
              paymentWebhookEvents.id,
          });

      if (
        insertedEvents.length ===
        0
      ) {
        const [
          existingEvent,
        ] =
          await tx
            .select({
              payloadHash:
                paymentWebhookEvents.payloadHash,
            })
            .from(
              paymentWebhookEvents,
            )
            .where(
              and(
                eq(
                  paymentWebhookEvents.provider,
                  provider,
                ),

                eq(
                  paymentWebhookEvents.providerEventId,
                  event.eventId,
                ),
              ),
            )
            .limit(1);

        if (
          existingEvent &&
          existingEvent.payloadHash !==
            eventPayloadHash
        ) {
          throw new PaymentDomainError(
            409,
            "WEBHOOK_EVENT_PAYLOAD_CONFLICT",
            "The provider event id was already used with a different payload.",
            {
              provider,
              providerEventId:
                event.eventId,
            },
          );
        }

        const [
          duplicateIntent,
        ] =
          await tx
            .select({
              status:
                paymentIntents.status,

              orderId:
                paymentIntents.orderId,
            })
            .from(
              paymentIntents,
            )
            .where(
              eq(
                paymentIntents.id,
                event.intentId,
              ),
            )
            .limit(1);

        return {
          idempotent:
            true,

          status:
            duplicateIntent
              ?.status ??
            "UNKNOWN",

          orderId:
            duplicateIntent
              ?.orderId ??
            null,
        };
      }

      await tx.execute(
        sql`
          SELECT pg_advisory_xact_lock(
            hashtextextended(
              ${event.intentId},
              0
            )
          )
        `,
      );

      const [
        intent,
      ] =
        await tx
          .select()
          .from(
            paymentIntents,
          )
          .where(
            eq(
              paymentIntents.id,
              event.intentId,
            ),
          )
          .limit(1);

      if (!intent) {
        throw new PaymentDomainError(
          404,
          "PAYMENT_INTENT_NOT_FOUND",
          "Payment intent was not found.",
        );
      }

      if (
        intent.provider !==
        provider
      ) {
        throw new PaymentDomainError(
          409,
          "PAYMENT_PROVIDER_MISMATCH",
          "Payment event provider does not match the provider pinned to the payment intent.",
          {
            expected:
              intent.provider,

            received:
              provider,
          },
        );
      }

      if (
        event.type ===
        "payment.failed"
      ) {
        if (
          intent.status !==
          "SUCCEEDED"
        ) {
          await tx
            .update(
              paymentIntents,
            )
            .set({
              status:
                "FAILED",

              failedAt:
                new Date(),

              lastErrorCode:
                event.errorCode ??
                `${provider.toUpperCase()}_PAYMENT_FAILED`,

              updatedAt:
                new Date(),
            })
            .where(
              eq(
                paymentIntents.id,
                intent.id,
              ),
            );
        }

        await tx
          .update(
            paymentWebhookEvents,
          )
          .set({
            processedAt:
              new Date(),
          })
          .where(
            eq(
              paymentWebhookEvents.id,
              insertedEvents[0]!.id,
            ),
          );

        return {
          idempotent:
            false,

          status:
            intent.status ===
              "SUCCEEDED"
              ? "SUCCEEDED"
              : "FAILED",

          orderId:
            intent.orderId,
        };
      }

      if (
        intent.status ===
        "SUCCEEDED"
      ) {
        await tx
          .update(
            paymentWebhookEvents,
          )
          .set({
            processedAt:
              new Date(),
          })
          .where(
            eq(
              paymentWebhookEvents.id,
              insertedEvents[0]!.id,
            ),
          );

        return {
          idempotent:
            true,

          status:
            "SUCCEEDED",

          orderId:
            intent.orderId,
        };
      }

      const [
        order,
      ] =
        await tx
          .select()
          .from(
            marketplaceOrders,
          )
          .where(
            eq(
              marketplaceOrders.id,
              intent.orderId,
            ),
          )
          .limit(1);

      if (!order) {
        throw new Error(
          "Payment intent order is missing.",
        );
      }

      if (
        order.status !==
        "PENDING_PAYMENT"
      ) {
        throw new PaymentDomainError(
          409,
          "ORDER_NOT_PAYABLE",
          "Order is not pending payment.",
          {
            status:
              order.status,
          },
        );
      }

      if (
        order.customerTotalRial !==
        intent.amountRial
      ) {
        throw new PaymentDomainError(
          409,
          "PAYMENT_AMOUNT_MISMATCH",
          "Payment intent amount does not match order amount.",
        );
      }

      const now =
        new Date();

      if (
        intent.expiresAt.getTime() <=
        now.getTime()
      ) {
        throw new PaymentDomainError(
          409,
          "PAYMENT_INTENT_EXPIRED",
          "Payment intent has expired.",
        );
      }

      const activeReservations =
        await tx
          .select()
          .from(
            inventoryReservations,
          )
          .where(
            and(
              eq(
                inventoryReservations.orderId,
                order.id,
              ),

              eq(
                inventoryReservations.status,
                "ACTIVE",
              ),
            ),
          );

      if (
        activeReservations.length ===
        0
      ) {
        throw new PaymentDomainError(
          409,
          "RESERVATION_MISSING",
          "No active inventory reservation exists for this order.",
        );
      }

      for (
        const reservation
        of activeReservations
      ) {
        const updated =
          await tx
            .update(
              inventory,
            )
            .set({
              quantityOnHand:
                sql`${inventory.quantityOnHand} - ${reservation.quantity}`,

              quantityReserved:
                sql`${inventory.quantityReserved} - ${reservation.quantity}`,

              updatedAt:
                now,
            })
            .where(
              and(
                eq(
                  inventory.variantId,
                  reservation.variantId,
                ),

                sql`${inventory.quantityOnHand} >= ${reservation.quantity}`,

                sql`${inventory.quantityReserved} >= ${reservation.quantity}`,
              ),
            )
            .returning({
              id:
                inventory.id,
            });

        if (
          updated.length !==
          1
        ) {
          throw new PaymentDomainError(
            409,
            "INVENTORY_CONSUME_FAILED",
            "Reserved inventory could not be consumed safely.",
            {
              variantId:
                reservation.variantId,
            },
          );
        }
      }

      await tx
        .update(
          inventoryReservations,
        )
        .set({
          status:
            "CONSUMED",

        })
        .where(
          and(
            eq(
              inventoryReservations.orderId,
              order.id,
            ),

            eq(
              inventoryReservations.status,
              "ACTIVE",
            ),
          ),
        );

      const providerPaymentId =
        event.providerPaymentId ??
        `${provider}_pay_${randomUUID()}`;

      const [
        payment,
      ] =
        await tx
          .insert(
            payments,
          )
          .values({
            orderId:
              order.id,

            paymentIntentId:
              intent.id,

            provider,

            providerPaymentId,

            amountRial:
              intent.amountRial,

            currency:
              intent.currency,

            status:
              "SUCCEEDED",

            paidAt:
              now,

            updatedAt:
              now,
          })
          .returning();

      if (!payment) {
        throw new Error(
          "Payment record creation failed.",
        );
      }

      const sellerOrders =
        await tx
          .select()
          .from(
            marketplaceSellerOrders,
          )
          .where(
            eq(
              marketplaceSellerOrders.orderId,
              order.id,
            ),
          );

      if (
        sellerOrders.length ===
        0
      ) {
        throw new Error(
          "Seller orders are missing.",
        );
      }

      for (
        const sellerOrder
        of sellerOrders
      ) {
        await tx
          .insert(
            sellerBalances,
          )
          .values({
            storeId:
              sellerOrder.storeId,

            pendingRial:
              sellerOrder.sellerNetRial,

            availableRial:
              0,

            paidOutRial:
              0,

            updatedAt:
              now,
          })
          .onConflictDoUpdate({
            target:
              sellerBalances.storeId,

            set: {
              pendingRial:
                sql`${sellerBalances.pendingRial} + ${sellerOrder.sellerNetRial}`,

              updatedAt:
                now,
            },
          });
      }

      const [
        ledgerTransaction,
      ] =
        await tx
          .insert(
            financialLedgerTransactions,
          )
          .values({
            kind:
              "PAYMENT_CAPTURE",

            orderId:
              order.id,

            paymentId:
              payment.id,

            idempotencyKey:
              `capture:${intent.id}`,
          })
          .returning({
            id:
              financialLedgerTransactions.id,
          });

      if (!ledgerTransaction) {
        throw new Error(
          "Ledger transaction creation failed.",
        );
      }

      const postings:
        Array<{
          accountCode: string;
          storeId: string | null;
          amountRial: number;
        }> = [
          {
            accountCode:
              "PLATFORM_CASH",

            storeId:
              null,

            amountRial:
              order.customerTotalRial,
          },

          {
            accountCode:
              "PLATFORM_COMMISSION_REVENUE",

            storeId:
              null,

            amountRial:
              -order.platformCommissionRial,
          },

          ...sellerOrders.map(
            (
              sellerOrder,
            ) => ({
              accountCode:
                "SELLER_PAYABLE",

              storeId:
                sellerOrder.storeId,

              amountRial:
                -sellerOrder.sellerNetRial,
            }),
          ),
        ];

      assertBalanced(
        postings.map(
          (posting) =>
            posting.amountRial,
        ),
      );

      await tx
        .insert(
          financialLedgerPostings,
        )
        .values(
          postings.map(
            (
              posting,
            ) => ({
              transactionId:
                ledgerTransaction.id,

              accountCode:
                posting.accountCode,

              storeId:
                posting.storeId,

              amountRial:
                posting.amountRial,
            }),
          ),
        );

      await tx
        .update(
          marketplaceSellerOrders,
        )
        .set({
          status:
            "PAID",

          updatedAt:
            now,
        })
        .where(
          eq(
            marketplaceSellerOrders.orderId,
            order.id,
          ),
        );

      await tx
        .update(
          marketplaceOrders,
        )
        .set({
          status:
            "PAID",

          updatedAt:
            now,
        })
        .where(
          eq(
            marketplaceOrders.id,
            order.id,
          ),
        );

      if (order.userId) {
        await tx.execute(sql`
          INSERT INTO user_xp (user_id, total_xp)
          VALUES (${order.userId}, 1000)
          ON CONFLICT (user_id) DO NOTHING
        `);
        await tx.execute(sql`
          WITH awarded AS (
            INSERT INTO user_xp_awards (user_id, source, source_id, amount)
            VALUES (${order.userId}, 'purchase', ${order.id}, 125)
            ON CONFLICT (source, source_id) DO NOTHING
            RETURNING user_id, amount
          )
          UPDATE user_xp SET total_xp = user_xp.total_xp + awarded.amount,
            updated_at = now()
          FROM awarded WHERE user_xp.user_id = awarded.user_id
        `);
      }

      await tx
        .update(
          paymentIntents,
        )
        .set({
          status:
            "SUCCEEDED",

          succeededAt:
            now,

          lastErrorCode:
            null,

          updatedAt:
            now,
        })
        .where(
          eq(
            paymentIntents.id,
            intent.id,
          ),
        );


      // J2O-A: enqueue in the SAME transaction as successful capture.
      await enqueueSellerOrderPaidInTransaction(tx, sellerOrders);

      await tx
        .update(
          paymentWebhookEvents,
        )
        .set({
          processedAt:
            now,
        })
        .where(
          eq(
            paymentWebhookEvents.id,
            insertedEvents[0]!.id,
          ),
        );

      return {
        idempotent:
          false,

        status:
          "SUCCEEDED" as const,

        orderId:
          order.id,

        paymentId:
          payment.id,
      };
    },
  );
}

export async function processMockWebhook(
  event: MockWebhookEvent,
  canonicalPayload: string,
) {
  return processProviderWebhook(
    "mock",
    event,
    canonicalPayload,
  );
}

export async function expireDueOrders() {
  const now =
    new Date();

  const dueOrders =
    await db
      .select({
        id:
          marketplaceOrders.id,
      })
      .from(
        marketplaceOrders,
      )
      .where(
        and(
          eq(
            marketplaceOrders.status,
            "PENDING_PAYMENT",
          ),

          lte(
            marketplaceOrders.expiresAt,
            now,
          ),
        ),
      );

  let expired =
    0;

  for (
    const due
    of dueOrders
  ) {
    const changed =
      await db.transaction(
        async (
          tx,
        ) => {
          const [
            order,
          ] =
            await tx
              .select()
              .from(
                marketplaceOrders,
              )
              .where(
                and(
                  eq(
                    marketplaceOrders.id,
                    due.id,
                  ),

                  eq(
                    marketplaceOrders.status,
                    "PENDING_PAYMENT",
                  ),

                  lte(
                    marketplaceOrders.expiresAt,
                    now,
                  ),
                ),
              )
              .limit(1);

          if (!order) {
            return false;
          }

          const reservations =
            await tx
              .select()
              .from(
                inventoryReservations,
              )
              .where(
                and(
                  eq(
                    inventoryReservations.orderId,
                    order.id,
                  ),

                  eq(
                    inventoryReservations.status,
                    "ACTIVE",
                  ),
                ),
              );

          for (
            const reservation
            of reservations
          ) {
            await tx
              .update(
                inventory,
              )
              .set({
                quantityReserved:
                  sql`GREATEST(${inventory.quantityReserved} - ${reservation.quantity}, 0)`,

                updatedAt:
                  now,
              })
              .where(
                eq(
                  inventory.variantId,
                  reservation.variantId,
                ),
              );
          }

          await tx
            .update(
              inventoryReservations,
            )
            .set({
              status:
                "EXPIRED",

              releasedAt:
                now,
            })
            .where(
              and(
                eq(
                  inventoryReservations.orderId,
                  order.id,
                ),

                eq(
                  inventoryReservations.status,
                  "ACTIVE",
                ),
              ),
            );

          await tx
            .update(
              marketplaceSellerOrders,
            )
            .set({
              status:
                "CANCELLED",

              updatedAt:
                now,
            })
            .where(
              eq(
                marketplaceSellerOrders.orderId,
                order.id,
              ),
            );

          await tx
            .update(
              marketplaceOrders,
            )
            .set({
              status:
                "EXPIRED",

              updatedAt:
                now,
            })
            .where(
              eq(
                marketplaceOrders.id,
                order.id,
              ),
            );

          await tx
            .update(
              paymentIntents,
            )
            .set({
              status:
                "EXPIRED",

              updatedAt:
                now,
            })
            .where(
              and(
                eq(
                  paymentIntents.orderId,
                  order.id,
                ),

                inArray(
                  paymentIntents.status,
                  [
                    "REQUIRES_PAYMENT",
                    "PROCESSING",
                    "FAILED",
                  ],
                ),
              ),
            );

          return true;
        },
      );

    if (changed) {
      expired +=
        1;
    }
  }

  return {
    scanned:
      dueOrders.length,

    expired,
  };
}

export async function finalizeSuccessfulRefund(
  refundId: string,
) {
  return db.transaction(
    async (
      tx,
    ) => {
      await tx.execute(
        sql`
          SELECT pg_advisory_xact_lock(
            hashtextextended(
              ${`refund-finalize:${refundId}`},
              0
            )
          )
        `,
      );

      const [
        refund,
      ] =
        await tx
          .select()
          .from(
            refunds,
          )
          .where(
            eq(
              refunds.id,
              refundId,
            ),
          )
          .limit(1);

      if (!refund) {
        throw new PaymentDomainError(
          404,
          "REFUND_NOT_FOUND",
          "Refund was not found.",
        );
      }

      if (
        refund.status ===
        "SUCCEEDED"
      ) {
        return {
          refund,
          idempotent:
            true,
        };
      }

      if (
        refund.status !==
        "PENDING"
      ) {
        throw new PaymentDomainError(
          409,
          "REFUND_NOT_FINALIZABLE",
          "Only a pending refund can be finalized.",
          {
            status:
              refund.status,
          },
        );
      }

      if (
        !refund.providerRefundId
      ) {
        throw new PaymentDomainError(
          409,
          "REFUND_PROVIDER_REFERENCE_MISSING",
          "Refund cannot be finalized before the provider reference is stored.",
        );
      }

      await tx.execute(
        sql`
          SELECT pg_advisory_xact_lock(
            hashtextextended(
              ${`refund:${refund.orderId}`},
              0
            )
          )
        `,
      );

      const [
        order,
      ] =
        await tx
          .select()
          .from(
            marketplaceOrders,
          )
          .where(
            eq(
              marketplaceOrders.id,
              refund.orderId,
            ),
          )
          .limit(1);

      if (!order) {
        throw new PaymentDomainError(
          404,
          "ORDER_NOT_FOUND",
          "Order was not found.",
        );
      }

      const [
        payment,
      ] =
        await tx
          .select()
          .from(
            payments,
          )
          .where(
            eq(
              payments.id,
              refund.paymentId,
            ),
          )
          .limit(1);

      if (!payment) {
        throw new PaymentDomainError(
          404,
          "PAYMENT_NOT_FOUND",
          "Payment was not found.",
        );
      }

      if (
        payment.status !==
          "SUCCEEDED" ||
        payment.refundedRial !==
          0
      ) {
        throw new PaymentDomainError(
          409,
          "PAYMENT_NOT_REFUNDABLE",
          "Payment is not eligible for refund finalization.",
        );
      }

      if (
        order.status !==
        "PAID"
      ) {
        throw new PaymentDomainError(
          409,
          "ORDER_NOT_REFUNDABLE",
          "Order is not eligible for refund finalization.",
          {
            status:
              order.status,
          },
        );
      }

      const sellerOrders =
        await tx
          .select()
          .from(
            marketplaceSellerOrders,
          )
          .where(
            eq(
              marketplaceSellerOrders.orderId,
              order.id,
            ),
          );

      const orderItems =
        await tx
          .select({
            sellerOrderId:
              marketplaceOrderItems.sellerOrderId,

            variantId:
              marketplaceOrderItems.variantId,

            quantity:
              marketplaceOrderItems.quantity,
          })
          .from(
            marketplaceOrderItems,
          )
          .where(
            eq(
              marketplaceOrderItems.orderId,
              order.id,
            ),
          );

      const now =
        new Date();

      for (
        const sellerOrder
        of sellerOrders
      ) {
        await tx.execute(
          sql`
            SELECT pg_advisory_xact_lock(
              hashtextextended(
                ${`seller-balance:${sellerOrder.storeId}`},
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
                sellerOrder.storeId,
              ),
            )
            .limit(1);

        if (!balance) {
          throw new PaymentDomainError(
            409,
            "SELLER_BALANCE_CONFLICT",
            "Seller balance row is missing.",
            {
              storeId:
                sellerOrder.storeId,
            },
          );
        }

        const nextBalance =
          applyRefundClawback(
            balance,
            sellerOrder.sellerNetRial,
          );

        const balanceUpdate =
          await tx
            .update(
              sellerBalances,
            )
            .set({
              pendingRial:
                nextBalance.pendingRial,

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
                sellerOrder.storeId,
              ),
            )
            .returning({
              storeId:
                sellerBalances.storeId,
            });

        if (
          balanceUpdate.length !==
          1
        ) {
          throw new PaymentDomainError(
            409,
            "SELLER_BALANCE_CONFLICT",
            "Seller balance could not be adjusted for this refund.",
            {
              storeId:
                sellerOrder.storeId,
            },
          );
        }
      }

      const sellerOrderStatus =
        new Map(
          sellerOrders.map(
            sellerOrder => [
              sellerOrder.id,
              sellerOrder.status,
            ] as const,
          ),
        );

      for (
        const item
        of orderItems
      ) {
        if (
          sellerOrderStatus.get(
            item.sellerOrderId,
          ) !==
          "PAID"
        ) {
          continue;
        }

        await tx
          .update(
            inventory,
          )
          .set({
            quantityOnHand:
              sql`${inventory.quantityOnHand} + ${item.quantity}`,

            updatedAt:
              now,
          })
          .where(
            eq(
              inventory.variantId,
              item.variantId,
            ),
          );
      }

      const [
        ledgerTransaction,
      ] =
        await tx
          .insert(
            financialLedgerTransactions,
          )
          .values({
            kind:
              "REFUND",

            orderId:
              order.id,

            paymentId:
              payment.id,

            refundId:
              refund.id,

            idempotencyKey:
              `refund:${refund.idempotencyKey}`,
          })
          .returning({
            id:
              financialLedgerTransactions.id,
          });

      if (!ledgerTransaction) {
        throw new Error(
          "Refund ledger transaction creation failed.",
        );
      }

      const postings:
        Array<{
          accountCode: string;
          storeId: string | null;
          amountRial: number;
        }> = [
          {
            accountCode:
              "PLATFORM_CASH",

            storeId:
              null,

            amountRial:
              -payment.amountRial,
          },

          {
            accountCode:
              "PLATFORM_COMMISSION_REVENUE",

            storeId:
              null,

            amountRial:
              order.platformCommissionRial,
          },

          ...sellerOrders.map(
            (
              sellerOrder,
            ) => ({
              accountCode:
                "SELLER_PAYABLE",

              storeId:
                sellerOrder.storeId,

              amountRial:
                sellerOrder.sellerNetRial,
            }),
          ),
        ];

      assertBalanced(
        postings.map(
          posting =>
            posting.amountRial,
        ),
      );

      await tx
        .insert(
          financialLedgerPostings,
        )
        .values(
          postings.map(
            posting => ({
              transactionId:
                ledgerTransaction.id,

              accountCode:
                posting.accountCode,

              storeId:
                posting.storeId,

              amountRial:
                posting.amountRial,
            }),
          ),
        );

      await tx
        .update(
          payments,
        )
        .set({
          status:
            "REFUNDED",

          refundedRial:
            payment.amountRial,

          updatedAt:
            now,
        })
        .where(
          eq(
            payments.id,
            payment.id,
          ),
        );

      await tx
        .update(
          refunds,
        )
        .set({
          status:
            "SUCCEEDED",

          succeededAt:
            now,

          failedAt:
            null,

          updatedAt:
            now,
        })
        .where(
          eq(
            refunds.id,
            refund.id,
          ),
        );

      await tx
        .update(
          marketplaceSellerOrders,
        )
        .set({
          status:
            "REFUNDED",

          updatedAt:
            now,
        })
        .where(
          eq(
            marketplaceSellerOrders.orderId,
            order.id,
          ),
        );

      await tx
        .update(
          marketplaceOrders,
        )
        .set({
          status:
            "REFUNDED",

          updatedAt:
            now,
        })
        .where(
          eq(
            marketplaceOrders.id,
            order.id,
          ),
        );

      const [
        completedRefund,
      ] =
        await tx
          .select()
          .from(
            refunds,
          )
          .where(
            eq(
              refunds.id,
              refund.id,
            ),
          )
          .limit(1);

      return {
        refund:
          completedRefund,

        idempotent:
          false,
      };
    },
  );
}

export async function processFullRefund(
  orderId: string,
  idempotencyKey: string,
  reason: string,
) {
  const claim =
    await db.transaction(
      async (
        tx,
      ) => {
        await tx.execute(
          sql`
            SELECT pg_advisory_xact_lock(
              hashtextextended(
                ${`refund:${orderId}`},
                0
              )
            )
          `,
        );

        await tx.execute(
          sql`
            SELECT pg_advisory_xact_lock(
              hashtextextended(
                ${`refund-key:${idempotencyKey}`},
                0
              )
            )
          `,
        );

        const [
          existing,
        ] =
          await tx
            .select()
            .from(
              refunds,
            )
            .where(
              eq(
                refunds.idempotencyKey,
                idempotencyKey,
              ),
            )
            .limit(1);

        if (existing) {
          if (
            existing.orderId !==
              orderId ||
            existing.reason !==
              reason
          ) {
            throw new PaymentDomainError(
              409,
              "REFUND_IDEMPOTENCY_CONFLICT",
              "Refund idempotency key was reused with a different request.",
            );
          }

          return {
            refund:
              existing,

            payment:
              null,

            idempotent:
              true,
          };
        }

        const [
          order,
        ] =
          await tx
            .select()
            .from(
              marketplaceOrders,
            )
            .where(
              eq(
                marketplaceOrders.id,
                orderId,
              ),
            )
            .limit(1);

        if (!order) {
          throw new PaymentDomainError(
            404,
            "ORDER_NOT_FOUND",
            "Order was not found.",
          );
        }

        if (
          order.status !==
          "PAID"
        ) {
          throw new PaymentDomainError(
            409,
            "ORDER_NOT_REFUNDABLE",
            "Only paid orders can be fully refunded.",
            {
              status:
                order.status,
            },
          );
        }

        const [
          payment,
        ] =
          await tx
            .select()
            .from(
              payments,
            )
            .where(
              eq(
                payments.orderId,
                order.id,
              ),
            )
            .limit(1);

        if (
          !payment ||
          payment.status !==
            "SUCCEEDED" ||
          payment.refundedRial !==
            0
        ) {
          throw new PaymentDomainError(
            409,
            "PAYMENT_NOT_REFUNDABLE",
            "Payment is not eligible for a full refund.",
          );
        }

        const [
          activeRefund,
        ] =
          await tx
            .select({
              id:
                refunds.id,

              status:
                refunds.status,

              idempotencyKey:
                refunds.idempotencyKey,
            })
            .from(
              refunds,
            )
            .where(
              and(
                eq(
                  refunds.paymentId,
                  payment.id,
                ),

                inArray(
                  refunds.status,
                  [
                    "PENDING",
                    "SUCCEEDED",
                  ],
                ),
              ),
            )
            .limit(1);

        if (activeRefund) {
          throw new PaymentDomainError(
            409,
            "REFUND_ALREADY_ACTIVE",
            "A pending or completed full refund already exists for this payment.",
            {
              refundId:
                activeRefund.id,

              status:
                activeRefund.status,
            },
          );
        }

        const adapter =
          findRefundProvider(
            payment.provider,
          );

        if (!adapter) {
          throw new PaymentDomainError(
            409,
            "REFUND_PROVIDER_ADAPTER_REQUIRED",
            "The payment provider does not have a verified refund adapter. No refund claim was created.",
            {
              provider:
                payment.provider,
            },
          );
        }

        const now =
          new Date();

        const [
          refund,
        ] =
          await tx
            .insert(
              refunds,
            )
            .values({
              orderId:
                order.id,

              paymentId:
                payment.id,

              provider:
                payment.provider,

              providerRefundId:
                null,

              idempotencyKey,

              amountRial:
                payment.amountRial,

              currency:
                payment.currency,

              status:
                "PENDING",

              reason,

              updatedAt:
                now,
            })
            .returning();

        if (!refund) {
          throw new Error(
            "Refund claim creation failed.",
          );
        }

        return {
          refund,
          payment,
          idempotent:
            false,
        };
      },
    );

  if (
    claim.idempotent ||
    !claim.payment
  ) {
    return {
      refund:
        claim.refund,

      idempotent:
        true,
    };
  }

  const adapter =
    findRefundProvider(
      claim.payment.provider,
    );

  if (!adapter) {
    throw new PaymentDomainError(
      409,
      "REFUND_PROVIDER_ADAPTER_REQUIRED",
      "The refund adapter disappeared after the refund was claimed.",
      {
        provider:
          claim.payment.provider,
      },
    );
  }

  const [
    refundProviderBinding,
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
          claim.payment
            .paymentIntentId,
        ),
      )
      .limit(1);

  if (
    claim.payment.provider ===
      "zarinpal"
  ) {
    if (
      !refundProviderBinding ||
      refundProviderBinding.providerKey !==
        "zarinpal" ||
      !refundProviderBinding
        .providerIntentId
    ) {
      throw new PaymentDomainError(
        409,
        "ZARINPAL_REFUND_PAYMENT_PROVENANCE_MISSING",
        "The original ZarinPal payment authority is missing, so automatic refund is blocked.",
      );
    }

    if (
      !refundProviderBinding
        .providerReference ||
      refundProviderBinding
        .providerReference !==
        claim.payment
          .providerPaymentId
    ) {
      throw new PaymentDomainError(
        409,
        "ZARINPAL_REFUND_PAYMENT_REFERENCE_MISMATCH",
        "The stored ZarinPal payment references do not match, so automatic refund is blocked.",
      );
    }
  }

  let providerResult:
    Awaited<
      ReturnType<
        typeof adapter.createRefund
      >
    >;

  try {
    providerResult =
      await adapter
        .createRefund({
          refundId:
            claim.refund.id,

          orderId:
            claim.refund.orderId,

          paymentId:
            claim.payment.id,

          providerPaymentId:
            claim.payment.providerPaymentId,

          providerIntentId:
            refundProviderBinding
              ?.providerIntentId ??
            null,

          providerReference:
            refundProviderBinding
              ?.providerReference ??
            claim.payment
              .providerPaymentId,

          amountRial:
            claim.payment.amountRial,

          currency:
            claim.payment.currency,

          idempotencyKey:
            claim.refund.idempotencyKey,

          reason:
            claim.refund.reason,
        });
  }
  catch (error) {
    const now =
      new Date();

    if (
      error instanceof
        RefundProviderUncertainError
    ) {
      await db
        .update(
          refunds,
        )
        .set({
          status:
            "PENDING",

          failedAt:
            null,

          updatedAt:
            now,
        })
        .where(
          eq(
            refunds.id,
            claim.refund.id,
          ),
        );

      throw new PaymentDomainError(
        502,
        "REFUND_PROVIDER_OUTCOME_UNCERTAIN",
        "The refund provider outcome is uncertain. The refund remains pending and duplicate automatic retries are blocked.",
        {
          provider:
            claim.payment.provider,

          providerCode:
            error.code,

          refundId:
            claim.refund.id,
        },
      );
    }

    await db
      .update(
        refunds,
      )
      .set({
        status:
          "FAILED",

        failedAt:
          now,

        updatedAt:
          now,
      })
      .where(
        eq(
          refunds.id,
          claim.refund.id,
        ),
      );

    throw new PaymentDomainError(
      502,
      "REFUND_PROVIDER_ERROR",
      error instanceof Error
        ? error.message
        : "Refund provider failed.",
      {
        provider:
          claim.payment.provider,
      },
    );
  }

  if (
    providerResult.provider !==
    claim.payment.provider
  ) {
    const now =
      new Date();

    await db
      .update(
        refunds,
      )
      .set({
        status:
          "FAILED",

        failedAt:
          now,

        updatedAt:
          now,
      })
      .where(
        eq(
          refunds.id,
          claim.refund.id,
        ),
      );

    throw new PaymentDomainError(
      409,
      "REFUND_PROVIDER_MISMATCH",
      "Refund provider result does not match the provider pinned to the payment.",
      {
        expected:
          claim.payment.provider,

        received:
          providerResult.provider,
      },
    );
  }

  const now =
    new Date();

  const [
    stored,
  ] =
    await db
      .update(
        refunds,
      )
      .set({
        providerRefundId:
          providerResult.providerRefundId,

        status:
          providerResult.status ===
            "FAILED"
            ? "FAILED"
            : "PENDING",

        failedAt:
          providerResult.status ===
            "FAILED"
            ? now
            : null,

        updatedAt:
          now,
      })
      .where(
        eq(
          refunds.id,
          claim.refund.id,
        ),
      )
      .returning();

  if (!stored) {
    throw new Error(
      "Refund provider result persistence failed.",
    );
  }

  if (
    providerResult.status ===
    "FAILED"
  ) {
    return {
      refund:
        stored,

      idempotent:
        false,
    };
  }

  if (
    providerResult.status ===
    "PROCESSING"
  ) {
    return {
      refund:
        stored,

      idempotent:
        false,
    };
  }

  return finalizeSuccessfulRefund(
    stored.id,
  );
}
