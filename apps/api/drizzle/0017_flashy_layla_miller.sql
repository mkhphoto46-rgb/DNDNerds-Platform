CREATE TABLE "seller_notification_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"store_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"channel" varchar(20) NOT NULL,
	"status" varchar(20) DEFAULT 'CONNECTED' NOT NULL,
	"peer_ciphertext" text,
	"peer_fingerprint" varchar(64),
	"verified_by" varchar(40),
	"connected_at" timestamp with time zone,
	"disconnected_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "seller_notification_connections_channel_check" CHECK ("seller_notification_connections"."channel" IN ('TELEGRAM','BALE')),
	CONSTRAINT "seller_notification_connections_status_check" CHECK ("seller_notification_connections"."status" IN ('CONNECTED','DISCONNECTED'))
);
--> statement-breakpoint
CREATE TABLE "seller_notification_pairing_challenges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"store_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"channel" varchar(20) NOT NULL,
	"token_hash" varchar(64) NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "seller_notification_pairing_channel_check" CHECK ("seller_notification_pairing_challenges"."channel" IN ('TELEGRAM','BALE'))
);
--> statement-breakpoint
ALTER TABLE "seller_notification_connections" ADD CONSTRAINT "seller_notification_connections_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seller_notification_connections" ADD CONSTRAINT "seller_notification_connections_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seller_notification_pairing_challenges" ADD CONSTRAINT "seller_notification_pairing_challenges_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seller_notification_pairing_challenges" ADD CONSTRAINT "seller_notification_pairing_challenges_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "seller_notification_connections_unique" ON "seller_notification_connections" USING btree ("store_id","user_id","channel");--> statement-breakpoint
CREATE INDEX "seller_notification_connections_store_idx" ON "seller_notification_connections" USING btree ("store_id","channel");--> statement-breakpoint
CREATE UNIQUE INDEX "seller_notification_pairing_token_unique" ON "seller_notification_pairing_challenges" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "seller_notification_pairing_recipient_idx" ON "seller_notification_pairing_challenges" USING btree ("store_id","user_id","channel");