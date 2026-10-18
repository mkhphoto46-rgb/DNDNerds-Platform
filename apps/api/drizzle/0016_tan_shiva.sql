CREATE TABLE "seller_notification_outbox" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"store_id" uuid NOT NULL,
	"seller_order_id" uuid,
	"recipient_user_id" uuid NOT NULL,
	"event_type" varchar(80) NOT NULL,
	"channel" varchar(20) NOT NULL,
	"dedupe_key" varchar(250) NOT NULL,
	"payload" jsonb NOT NULL,
	"status" varchar(24) DEFAULT 'PENDING' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"available_at" timestamp with time zone DEFAULT now() NOT NULL,
	"locked_until" timestamp with time zone,
	"claim_token" uuid,
	"delivered_at" timestamp with time zone,
	"read_at" timestamp with time zone,
	"last_error" varchar(500),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "seller_notification_outbox_status_check" CHECK ("seller_notification_outbox"."status" IN ('PENDING','PROCESSING','DELIVERED','FAILED')),
	CONSTRAINT "seller_notification_outbox_channel_check" CHECK ("seller_notification_outbox"."channel" IN ('IN_APP','EMAIL','TELEGRAM','BALE','WEB_PUSH')),
	CONSTRAINT "seller_notification_outbox_attempts_check" CHECK ("seller_notification_outbox"."attempts" >= 0)
);
--> statement-breakpoint
CREATE TABLE "seller_notification_preferences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"store_id" uuid NOT NULL,
	"event_type" varchar(80) NOT NULL,
	"channel" varchar(20) NOT NULL,
	"enabled" boolean NOT NULL,
	"updated_by_user_id" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "seller_notification_preferences_channel_check" CHECK ("seller_notification_preferences"."channel" IN ('IN_APP','EMAIL','TELEGRAM','BALE','WEB_PUSH')),
	CONSTRAINT "seller_notification_preferences_event_check" CHECK ("seller_notification_preferences"."event_type" IN ('SELLER_ORDER_PAID','REFUND_CASE_OPENED','LOW_STOCK','PAYOUT_COMPLETED'))
);
--> statement-breakpoint
ALTER TABLE "seller_notification_outbox" ADD CONSTRAINT "seller_notification_outbox_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seller_notification_outbox" ADD CONSTRAINT "seller_notification_outbox_seller_order_id_marketplace_seller_orders_id_fk" FOREIGN KEY ("seller_order_id") REFERENCES "public"."marketplace_seller_orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seller_notification_outbox" ADD CONSTRAINT "seller_notification_outbox_recipient_user_id_users_id_fk" FOREIGN KEY ("recipient_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seller_notification_preferences" ADD CONSTRAINT "seller_notification_preferences_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seller_notification_preferences" ADD CONSTRAINT "seller_notification_preferences_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "seller_notification_outbox_dedupe_unique" ON "seller_notification_outbox" USING btree ("dedupe_key");--> statement-breakpoint
CREATE INDEX "seller_notification_outbox_dispatch_idx" ON "seller_notification_outbox" USING btree ("status","channel","available_at");--> statement-breakpoint
CREATE INDEX "seller_notification_outbox_recipient_idx" ON "seller_notification_outbox" USING btree ("store_id","recipient_user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "seller_notification_preferences_unique" ON "seller_notification_preferences" USING btree ("store_id","event_type","channel");