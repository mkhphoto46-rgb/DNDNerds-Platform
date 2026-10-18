import {
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
  inventory,
  marketplaceOrderItems,
  marketplaceOrders,
  marketplaceSellerOrders,
  paymentIntents,
  payments,
  productVariants,
  products,
  refunds,
  sellerBalances,
  sellerProfiles,
  stores,
  users,
} from "../db/schema.js";

import {
  processFullRefund,
} from "../payments/payment-service.js";

async function main() {
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
    const [
      user,
    ] =
      await db
        .insert(
          users,
        )
        .values({
          email:
            `j2k-refund-${suffix}@example.test`,

          status:
            "ACTIVE",

          emailVerified:
            false,
        })
        .returning();

    if (!user) {
      throw new Error(
        "J2K refund user creation failed.",
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
            `J2K Seller ${suffix}`,

          status:
            "ACTIVE",
        })
        .returning();

    if (!seller) {
      throw new Error(
        "J2K seller profile creation failed.",
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
            `j2k-refund-${suffix}`,

          name:
            `J2K Refund Store ${suffix}`,

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
        "J2K store creation failed.",
      );
    }

    const [
      product,
    ] =
      await db
        .insert(
          products,
        )
        .values({
          storeId:
            store.id,

          slug:
            `j2k-product-${suffix}`,

          name:
            "J2K Refund Product",

          description:
            "J2K deterministic refund self-test product.",

          category:
            "test",

          status:
            "PUBLISHED",
        })
        .returning();

    if (!product) {
      throw new Error(
        "J2K product creation failed.",
      );
    }

    const [
      variant,
    ] =
      await db
        .insert(
          productVariants,
        )
        .values({
          productId:
            product.id,

          sku:
            `J2K-${suffix}`,

          name:
            "Default",

          priceRial:
            100_000,

          isDefault:
            true,

          status:
            "ACTIVE",
        })
        .returning();

    if (!variant) {
      throw new Error(
        "J2K variant creation failed.",
      );
    }

    await db
      .insert(
        inventory,
      )
      .values({
        variantId:
          variant.id,

        quantityOnHand:
          9,

        quantityReserved:
          0,
      });

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
            `j2k-order-${suffix}`,

          status:
            "PAID",

          customerTotalRial:
            100_000,

          platformCommissionRial:
            5_000,

          sellerNetRial:
            95_000,

          expiresAt:
            new Date(
              Date.now() +
              15 * 60_000,
            ),
        })
        .returning();

    if (!order) {
      throw new Error(
        "J2K order creation failed.",
      );
    }

    orderId =
      order.id;

    const [
      sellerOrder,
    ] =
      await db
        .insert(
          marketplaceSellerOrders,
        )
        .values({
          orderId:
            order.id,

          storeId:
            store.id,

          status:
            "PAID",

          grossRial:
            100_000,

          commissionBpsSnapshot:
            500,

          platformCommissionRial:
            5_000,

          sellerNetRial:
            95_000,
        })
        .returning();

    if (!sellerOrder) {
      throw new Error(
        "J2K seller order creation failed.",
      );
    }

    await db
      .insert(
        marketplaceOrderItems,
      )
      .values({
        orderId:
          order.id,

        sellerOrderId:
          sellerOrder.id,

        storeId:
          store.id,

        productId:
          product.id,

        variantId:
          variant.id,

        productNameSnapshot:
          product.name,

        productSlugSnapshot:
          product.slug,

        variantNameSnapshot:
          variant.name,

        skuSnapshot:
          variant.sku,

        quantity:
          1,

        unitPriceRial:
          100_000,

        lineTotalRial:
          100_000,

        commissionBpsSnapshot:
          500,

        commissionRial:
          5_000,

        sellerNetRial:
          95_000,
      });

    const [
      intent,
    ] =
      await db
        .insert(
          paymentIntents,
        )
        .values({
          orderId:
            order.id,

          provider:
            "mock",

          providerIntentId:
            `j2k_mock_intent_${suffix}`,

          status:
            "SUCCEEDED",

          amountRial:
            100_000,

          idempotencyKey:
            `j2k-intent-${suffix}`,

          expiresAt:
            new Date(
              Date.now() +
              15 * 60_000,
            ),

          succeededAt:
            new Date(),
        })
        .returning();

    if (!intent) {
      throw new Error(
        "J2K payment intent creation failed.",
      );
    }

    const [
      payment,
    ] =
      await db
        .insert(
          payments,
        )
        .values({
          orderId:
            order.id,

          paymentIntentId:
            intent.id,

          provider:
            "mock",

          providerPaymentId:
            `j2k_mock_payment_${suffix}`,

          amountRial:
            100_000,

          refundedRial:
            0,

          status:
            "SUCCEEDED",

          paidAt:
            new Date(),
        })
        .returning();

    if (!payment) {
      throw new Error(
        "J2K payment creation failed.",
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
          95_000,

        availableRial:
          0,

        negativeRial:
          0,

        paidOutRial:
          0,
      });

    const refundKey =
      `j2k-refund-key-${suffix}`;

    const first =
      await processFullRefund(
        order.id,
        refundKey,
        "J2K deterministic full refund",
      );

    if (
      !first.refund ||
      first.refund.status !==
        "SUCCEEDED" ||
      !first.refund.providerRefundId
    ) {
      throw new Error(
        "First refund did not complete successfully.",
      );
    }

    const replay =
      await processFullRefund(
        order.id,
        refundKey,
        "J2K deterministic full refund",
      );

    if (
      !replay.idempotent
    ) {
      throw new Error(
        "Refund replay was not idempotent.",
      );
    }

    const [
      finalOrder,
    ] =
      await db
        .select()
        .from(
          marketplaceOrders,
        )
        .where(
          eq(
            marketplaceOrders.id,
            order.id,
          ),
        )
        .limit(1);

    const [
      finalPayment,
    ] =
      await db
        .select()
        .from(
          payments,
        )
        .where(
          eq(
            payments.id,
            payment.id,
          ),
        )
        .limit(1);

    const [
      finalInventory,
    ] =
      await db
        .select()
        .from(
          inventory,
        )
        .where(
          eq(
            inventory.variantId,
            variant.id,
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

    const ledgerRows =
      await db
        .select()
        .from(
          financialLedgerTransactions,
        )
        .where(
          eq(
            financialLedgerTransactions.idempotencyKey,
            `refund:${refundKey}`,
          ),
        );

    if (
      finalOrder?.status !==
      "REFUNDED"
    ) {
      throw new Error(
        "Order was not finalized as REFUNDED.",
      );
    }

    if (
      finalPayment?.status !==
        "REFUNDED" ||
      finalPayment.refundedRial !==
        100_000
    ) {
      throw new Error(
        "Payment refund totals are incorrect.",
      );
    }

    if (
      finalInventory
        ?.quantityOnHand !==
      10
    ) {
      throw new Error(
        "Inventory was not restocked exactly once.",
      );
    }

    if (
      finalBalance
        ?.pendingRial !==
        0 ||
      finalBalance
        .availableRial !==
        0 ||
      finalBalance
        .negativeRial !==
        0
    ) {
      throw new Error(
        "Seller refund clawback balance is incorrect.",
      );
    }

    if (
      refundRows.length !==
      1
    ) {
      throw new Error(
        `Expected one refund row, found ${refundRows.length}.`,
      );
    }

    if (
      ledgerRows.length !==
      1
    ) {
      throw new Error(
        `Expected one refund ledger transaction, found ${ledgerRows.length}.`,
      );
    }

    console.log(
      JSON.stringify(
        {
          refundProvider:
            first.refund.provider,

          providerRefundIdStored:
            true,

          refundStatus:
            first.refund.status,

          replayIdempotent:
            replay.idempotent,

          inventoryRestockedOnce:
            true,

          sellerClawbackApplied:
            true,

          refundLedgerCount:
            ledgerRows.length,

          refundRows:
            refundRows.length,
        },
        null,
        2,
      ),
    );
  }
  finally {
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
