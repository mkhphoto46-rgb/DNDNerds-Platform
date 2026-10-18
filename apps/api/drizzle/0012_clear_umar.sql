CREATE TABLE "payout_request_destination_snapshots" (
	"payout_id" uuid PRIMARY KEY NOT NULL,
	"destination_id" uuid NOT NULL,
	"method" varchar(32) NOT NULL,
	"iban_ciphertext" text NOT NULL,
	"iban_iv" varchar(64) NOT NULL,
	"iban_auth_tag" varchar(64) NOT NULL,
	"iban_last4" varchar(4) NOT NULL,
	"iban_fingerprint" varchar(64) NOT NULL,
	"account_holder_name" varchar(160) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "payout_request_destination_snapshots" ADD CONSTRAINT "payout_request_destination_snapshots_payout_id_seller_payout_requests_id_fk" FOREIGN KEY ("payout_id") REFERENCES "public"."seller_payout_requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payout_request_destination_snapshots" ADD CONSTRAINT "payout_request_destination_snapshots_destination_id_seller_payout_destinations_id_fk" FOREIGN KEY ("destination_id") REFERENCES "public"."seller_payout_destinations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "payout_request_destination_snapshots_destination_idx" ON "payout_request_destination_snapshots" USING btree ("destination_id");