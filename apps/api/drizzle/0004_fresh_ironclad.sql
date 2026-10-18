CREATE TYPE "public"."marketplace_admin_role" AS ENUM('SUPER_ADMIN', 'MARKETPLACE_ADMIN', 'SUPPORT');--> statement-breakpoint
CREATE TYPE "public"."marketplace_shipment_status" AS ENUM('READY', 'SHIPPED', 'DELIVERED', 'CANCELLED');--> statement-breakpoint
CREATE TABLE "marketplace_admin_audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"admin_user_id" uuid NOT NULL,
	"action" varchar(120) NOT NULL,
	"entity_type" varchar(80) NOT NULL,
	"entity_id" varchar(180) NOT NULL,
	"details" varchar(1800),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "marketplace_admins" (
	"user_id" uuid NOT NULL,
	"role" "marketplace_admin_role" NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "marketplace_admins_user_id_pk" PRIMARY KEY("user_id")
);
--> statement-breakpoint
CREATE TABLE "marketplace_shipments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"seller_order_id" uuid NOT NULL,
	"store_id" uuid NOT NULL,
	"carrier" varchar(120),
	"tracking_code" varchar(160),
	"status" "marketplace_shipment_status" DEFAULT 'READY' NOT NULL,
	"shipped_at" timestamp with time zone,
	"delivered_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "marketplace_admin_audit_logs" ADD CONSTRAINT "marketplace_admin_audit_logs_admin_user_id_users_id_fk" FOREIGN KEY ("admin_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketplace_admins" ADD CONSTRAINT "marketplace_admins_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketplace_shipments" ADD CONSTRAINT "marketplace_shipments_seller_order_id_marketplace_seller_orders_id_fk" FOREIGN KEY ("seller_order_id") REFERENCES "public"."marketplace_seller_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketplace_shipments" ADD CONSTRAINT "marketplace_shipments_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "marketplace_admin_audit_logs_admin_idx" ON "marketplace_admin_audit_logs" USING btree ("admin_user_id");--> statement-breakpoint
CREATE INDEX "marketplace_admin_audit_logs_entity_idx" ON "marketplace_admin_audit_logs" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE UNIQUE INDEX "marketplace_shipments_seller_order_id_uq" ON "marketplace_shipments" USING btree ("seller_order_id");--> statement-breakpoint
CREATE INDEX "marketplace_shipments_store_id_idx" ON "marketplace_shipments" USING btree ("store_id");