import { and, eq, inArray } from "drizzle-orm";
import { db } from "../db/client.js";
import { sellerNotificationOutbox, sellerNotificationPreferences, storeMembers } from "../db/schema.js";
import { defaultNotificationEnabled, notificationDedupeKey } from "./policy.js";

// Reuse the caller's payment transaction. A paid-order event cannot be lost between
// payment commit and enqueue, and no external network call happens in checkout.
type DbTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export async function enqueueSellerOrderPaidInTransaction(
  tx: DbTransaction,
  orders: ReadonlyArray<{
    id: string;
    orderId: string;
    storeId: string;
    grossRial: number;
  }>,
): Promise<void> {
  for (const order of orders) {
    const [preference] = await tx.select({ enabled: sellerNotificationPreferences.enabled })
      .from(sellerNotificationPreferences)
      .where(and(
        eq(sellerNotificationPreferences.storeId, order.storeId),
        eq(sellerNotificationPreferences.eventType, "SELLER_ORDER_PAID"),
        eq(sellerNotificationPreferences.channel, "IN_APP"),
      )).limit(1);
    const enabled = preference?.enabled ?? defaultNotificationEnabled("SELLER_ORDER_PAID", "IN_APP");
    if (!enabled) continue;

    // Store-scoped recipients only. Owners/managers/order managers can read paid orders.
    const members = await tx.select({ userId: storeMembers.userId }).from(storeMembers)
      .where(and(eq(storeMembers.storeId, order.storeId),
        inArray(storeMembers.role, ["OWNER", "MANAGER", "ORDER_MANAGER"])));
    for (const member of members) {
      await tx.insert(sellerNotificationOutbox).values({
        storeId: order.storeId,
        sellerOrderId: order.id,
        recipientUserId: member.userId,
        eventType: "SELLER_ORDER_PAID",
        channel: "IN_APP",
        dedupeKey: notificationDedupeKey({
          eventType: "SELLER_ORDER_PAID", sellerOrderId: order.id,
          channel: "IN_APP", recipientUserId: member.userId,
        }),
        payload: { orderId: order.orderId, sellerOrderId: order.id, grossRial: order.grossRial, currency: "IRR" },
      }).onConflictDoNothing({ target: sellerNotificationOutbox.dedupeKey });
    }
  }
}
