CREATE TYPE "public"."marketplace_order_status" AS ENUM('PENDING_PAYMENT', 'PAID', 'CANCELLED', 'EXPIRED', 'REFUNDED');--> statement-breakpoint
CREATE TYPE "public"."inventory_reservation_status" AS ENUM('ACTIVE', 'CONSUMED', 'RELEASED', 'EXPIRED');--> statement-breakpoint
CREATE TYPE "public"."seller_order_status" AS ENUM('PENDING_PAYMENT', 'PAID', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'CANCELLED', 'REFUNDED');--> statement-breakpoint
CREATE TABLE "inventory_reservations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"order_item_id" uuid NOT NULL,
	"variant_id" uuid NOT NULL,
	"quantity" integer NOT NULL,
	"status" "inventory_reservation_status" DEFAULT 'ACTIVE' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"released_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "inventory_reservations_quantity_positive" CHECK ("inventory_reservations"."quantity" > 0)
);
--> statement-breakpoint
CREATE TABLE "marketplace_order_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"seller_order_id" uuid NOT NULL,
	"store_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"variant_id" uuid NOT NULL,
	"product_name_snapshot" varchar(240) NOT NULL,
	"product_slug_snapshot" varchar(240) NOT NULL,
	"variant_name_snapshot" varchar(240) NOT NULL,
	"sku_snapshot" varchar(240) NOT NULL,
	"quantity" integer NOT NULL,
	"unit_price_rial" bigint NOT NULL,
	"line_total_rial" bigint NOT NULL,
	"commission_bps_snapshot" integer NOT NULL,
	"commission_rial" bigint NOT NULL,
	"seller_net_rial" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "marketplace_order_items_quantity_positive" CHECK ("marketplace_order_items"."quantity" > 0),
	CONSTRAINT "marketplace_order_items_unit_price_nonnegative" CHECK ("marketplace_order_items"."unit_price_rial" >= 0),
	CONSTRAINT "marketplace_order_items_line_total_nonnegative" CHECK ("marketplace_order_items"."line_total_rial" >= 0),
	CONSTRAINT "marketplace_order_items_commission_bps_range" CHECK ("marketplace_order_items"."commission_bps_snapshot" >= 0 AND "marketplace_order_items"."commission_bps_snapshot" <= 10000)
);
--> statement-breakpoint
CREATE TABLE "marketplace_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"idempotency_key" varchar(128) NOT NULL,
	"status" "marketplace_order_status" DEFAULT 'PENDING_PAYMENT' NOT NULL,
	"currency" varchar(3) DEFAULT 'IRR' NOT NULL,
	"customer_total_rial" bigint NOT NULL,
	"platform_commission_rial" bigint NOT NULL,
	"seller_net_rial" bigint NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "marketplace_orders_customer_total_nonnegative" CHECK ("marketplace_orders"."customer_total_rial" >= 0),
	CONSTRAINT "marketplace_orders_platform_commission_nonnegative" CHECK ("marketplace_orders"."platform_commission_rial" >= 0),
	CONSTRAINT "marketplace_orders_seller_net_nonnegative" CHECK ("marketplace_orders"."seller_net_rial" >= 0)
);
--> statement-breakpoint
CREATE TABLE "marketplace_seller_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"store_id" uuid NOT NULL,
	"status" "seller_order_status" DEFAULT 'PENDING_PAYMENT' NOT NULL,
	"currency" varchar(3) DEFAULT 'IRR' NOT NULL,
	"gross_rial" bigint NOT NULL,
	"commission_bps_snapshot" integer NOT NULL,
	"platform_commission_rial" bigint NOT NULL,
	"seller_net_rial" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "marketplace_seller_orders_commission_bps_range" CHECK ("marketplace_seller_orders"."commission_bps_snapshot" >= 0 AND "marketplace_seller_orders"."commission_bps_snapshot" <= 10000),
	CONSTRAINT "marketplace_seller_orders_gross_nonnegative" CHECK ("marketplace_seller_orders"."gross_rial" >= 0),
	CONSTRAINT "marketplace_seller_orders_commission_nonnegative" CHECK ("marketplace_seller_orders"."platform_commission_rial" >= 0),
	CONSTRAINT "marketplace_seller_orders_net_nonnegative" CHECK ("marketplace_seller_orders"."seller_net_rial" >= 0)
);
--> statement-breakpoint
ALTER TABLE "inventory_reservations" ADD CONSTRAINT "inventory_reservations_order_id_marketplace_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."marketplace_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_reservations" ADD CONSTRAINT "inventory_reservations_order_item_id_marketplace_order_items_id_fk" FOREIGN KEY ("order_item_id") REFERENCES "public"."marketplace_order_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_reservations" ADD CONSTRAINT "inventory_reservations_variant_id_product_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketplace_order_items" ADD CONSTRAINT "marketplace_order_items_order_id_marketplace_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."marketplace_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketplace_order_items" ADD CONSTRAINT "marketplace_order_items_seller_order_id_marketplace_seller_orders_id_fk" FOREIGN KEY ("seller_order_id") REFERENCES "public"."marketplace_seller_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketplace_order_items" ADD CONSTRAINT "marketplace_order_items_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketplace_order_items" ADD CONSTRAINT "marketplace_order_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketplace_order_items" ADD CONSTRAINT "marketplace_order_items_variant_id_product_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketplace_orders" ADD CONSTRAINT "marketplace_orders_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketplace_seller_orders" ADD CONSTRAINT "marketplace_seller_orders_order_id_marketplace_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."marketplace_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketplace_seller_orders" ADD CONSTRAINT "marketplace_seller_orders_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "inventory_reservations_order_item_uq" ON "inventory_reservations" USING btree ("order_item_id");--> statement-breakpoint
CREATE INDEX "inventory_reservations_order_id_idx" ON "inventory_reservations" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "inventory_reservations_variant_id_idx" ON "inventory_reservations" USING btree ("variant_id");--> statement-breakpoint
CREATE INDEX "inventory_reservations_status_expires_idx" ON "inventory_reservations" USING btree ("status","expires_at");--> statement-breakpoint
CREATE INDEX "marketplace_order_items_order_id_idx" ON "marketplace_order_items" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "marketplace_order_items_seller_order_id_idx" ON "marketplace_order_items" USING btree ("seller_order_id");--> statement-breakpoint
CREATE INDEX "marketplace_order_items_product_id_idx" ON "marketplace_order_items" USING btree ("product_id");--> statement-breakpoint
CREATE UNIQUE INDEX "marketplace_orders_idempotency_key_uq" ON "marketplace_orders" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "marketplace_orders_user_id_idx" ON "marketplace_orders" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "marketplace_orders_status_idx" ON "marketplace_orders" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "marketplace_seller_orders_order_store_uq" ON "marketplace_seller_orders" USING btree ("order_id","store_id");--> statement-breakpoint
CREATE INDEX "marketplace_seller_orders_store_id_idx" ON "marketplace_seller_orders" USING btree ("store_id");--> statement-breakpoint
CREATE INDEX "marketplace_seller_orders_status_idx" ON "marketplace_seller_orders" USING btree ("status");