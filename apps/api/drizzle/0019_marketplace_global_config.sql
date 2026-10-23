-- The marketplace's global settings row is required to place an order
-- (routes/orders.ts reads id 'global'). It used to exist only after
-- `npm run db:seed`, so a database built from the migrations alone failed every
-- order with a server error. Same defaults as the seed; an existing row is kept.
INSERT INTO "marketplace_config" ("id", "default_commission_bps", "multi_vendor_cart", "seller_fulfillment", "platform_own_inventory")
VALUES ('global', 500, true, true, false)
ON CONFLICT ("id") DO NOTHING;
