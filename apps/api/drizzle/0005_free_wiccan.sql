CREATE TYPE "public"."seller_payout_status" AS ENUM('REQUESTED', 'APPROVED', 'REJECTED', 'PAID');--> statement-breakpoint
ALTER TYPE "public"."ledger_transaction_kind" ADD VALUE 'PAYOUT';--> statement-breakpoint
CREATE TABLE "seller_payout_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"store_id" uuid NOT NULL,
	"requested_by_user_id" uuid NOT NULL,
	"amount_rial" integer NOT NULL,
	"currency" varchar(3) DEFAULT 'IRR' NOT NULL,
	"status" "seller_payout_status" DEFAULT 'REQUESTED' NOT NULL,
	"reviewed_by_admin_user_id" uuid,
	"review_reason" varchar(500),
	"payout_reference" varchar(220),
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reviewed_at" timestamp with time zone,
	"paid_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_totp_mfa" (
	"user_id" uuid NOT NULL,
	"encrypted_secret" varchar(700) NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"confirmed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_totp_mfa_user_id_pk" PRIMARY KEY("user_id")
);
--> statement-breakpoint
ALTER TABLE "financial_ledger_transactions" ALTER COLUMN "order_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "seller_payout_requests" ADD CONSTRAINT "seller_payout_requests_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seller_payout_requests" ADD CONSTRAINT "seller_payout_requests_requested_by_user_id_users_id_fk" FOREIGN KEY ("requested_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seller_payout_requests" ADD CONSTRAINT "seller_payout_requests_reviewed_by_admin_user_id_users_id_fk" FOREIGN KEY ("reviewed_by_admin_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_totp_mfa" ADD CONSTRAINT "user_totp_mfa_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "seller_payout_requests_store_idx" ON "seller_payout_requests" USING btree ("store_id");--> statement-breakpoint
CREATE INDEX "seller_payout_requests_status_idx" ON "seller_payout_requests" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "seller_payout_requests_reference_uq" ON "seller_payout_requests" USING btree ("payout_reference");