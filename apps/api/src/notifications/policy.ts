export const NOTIFICATION_EVENTS = [
  "SELLER_ORDER_PAID", "REFUND_CASE_OPENED", "LOW_STOCK", "PAYOUT_COMPLETED",
] as const;
export type SellerNotificationEvent = typeof NOTIFICATION_EVENTS[number];

export const NOTIFICATION_CHANNELS = [
  "IN_APP", "EMAIL", "TELEGRAM", "BALE", "WEB_PUSH",
] as const;
export type SellerNotificationChannel = typeof NOTIFICATION_CHANNELS[number];

// External channel adapters are deliberately NOT activated in phase J2O-A.
export function channelCanDeliver(channel: SellerNotificationChannel): boolean {
  return channel === "IN_APP";
}

export function defaultNotificationEnabled(
  eventType: SellerNotificationEvent,
  channel: SellerNotificationChannel,
): boolean {
  return eventType === "SELLER_ORDER_PAID" && channel === "IN_APP";
}

export function notificationDedupeKey(input: {
  eventType: SellerNotificationEvent;
  sellerOrderId: string;
  channel: SellerNotificationChannel;
  recipientUserId: string;
}): string {
  return `${input.eventType}:${input.sellerOrderId}:${input.channel}:${input.recipientUserId}`;
}
