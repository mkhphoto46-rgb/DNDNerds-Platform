CREATE TYPE "public"."payout_destination_status" AS ENUM('PENDING_REVIEW', 'VERIFIED', 'DISABLED', 'REJECTED');--> statement-breakpoint
CREATE TABLE "seller_payout_destinations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"store_id" uuid NOT NULL,
	"created_by_user_id" uuid NOT NULL,
	"method" varchar(32) DEFAULT 'IR_IBAN' NOT NULL,
	"iban_ciphertext" text NOT NULL,
	"iban_iv" varchar(64) NOT NULL,
	"iban_auth_tag" varchar(64) NOT NULL,
	"iban_last4" varchar(4) NOT NULL,
	"iban_fingerprint" varchar(64) NOT NULL,
	"account_holder_name" varchar(160) NOT NULL,
	"status" "payout_destination_status" DEFAULT 'PENDING_REVIEW' NOT NULL,
	"reviewed_by_admin_user_id" uuid,
	"review_reason" varchar(500),
	"reviewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "seller_payout_destinations" ADD CONSTRAINT "seller_payout_destinations_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seller_payout_destinations" ADD CONSTRAINT "seller_payout_destinations_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seller_payout_destinations" ADD CONSTRAINT "seller_payout_destinations_reviewed_by_admin_user_id_users_id_fk" FOREIGN KEY ("reviewed_by_admin_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "seller_payout_destinations_store_idx" ON "seller_payout_destinations" USING btree ("store_id");--> statement-breakpoint
CREATE INDEX "seller_payout_destinations_status_idx" ON "seller_payout_destinations" USING btree ("status");--> statement-breakpoint
CREATE INDEX "seller_payout_destinations_fingerprint_idx" ON "seller_payout_destinations" USING btree ("iban_fingerprint");