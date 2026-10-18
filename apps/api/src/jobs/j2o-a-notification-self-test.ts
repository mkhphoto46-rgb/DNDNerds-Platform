import assert from "node:assert/strict";
import {
  NOTIFICATION_CHANNELS, NOTIFICATION_EVENTS, channelCanDeliver,
  defaultNotificationEnabled, notificationDedupeKey,
} from "../notifications/policy.js";

assert.deepEqual(NOTIFICATION_CHANNELS, ["IN_APP", "EMAIL", "TELEGRAM", "BALE", "WEB_PUSH"]);
assert.equal(NOTIFICATION_EVENTS.includes("SELLER_ORDER_PAID"), true);
assert.equal(defaultNotificationEnabled("SELLER_ORDER_PAID", "IN_APP"), true);
assert.equal(defaultNotificationEnabled("REFUND_CASE_OPENED", "IN_APP"), false);
for (const channel of NOTIFICATION_CHANNELS) {
  assert.equal(channelCanDeliver(channel), channel === "IN_APP");
}
const key = notificationDedupeKey({
  eventType: "SELLER_ORDER_PAID", sellerOrderId: "seller-1", channel: "IN_APP", recipientUserId: "u-1",
});
assert.equal(key, "SELLER_ORDER_PAID:seller-1:IN_APP:u-1");
assert.notEqual(key, notificationDedupeKey({
  eventType: "SELLER_ORDER_PAID", sellerOrderId: "seller-1", channel: "IN_APP", recipientUserId: "u-2",
}));
console.log("J2O-A POLICY SELF-TEST PASS; EXTERNAL DELIVERY DISABLED");
