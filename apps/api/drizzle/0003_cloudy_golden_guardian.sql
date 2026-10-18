CREATE TYPE "public"."ledger_transaction_kind" AS ENUM('PAYMENT_CAPTURE', 'REFUND');--> statement-breakpoint
CREATE TYPE "public"."payment_intent_status" AS ENUM('REQUIRES_PAYMENT', 'PROCESSING', 'SUCCEEDED', 'FAILED', 'CANCELLED', 'EXPIRED');--> statement-breakpoint
CREATE TYPE "public"."payment_status" AS ENUM('SUCCEEDED', 'PARTIALLY_REFUNDED', 'REFUNDED');--> statement-breakpoint
CREATE TYPE "public"."refund_status" AS ENUM('PENDING', 'SUCCEEDED', 'FAILED');--> statement-breakpoint
CREATE TABLE "financial_ledger_postings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"transaction_id" uuid NOT NULL,
	"account_code" varchar(80) NOT NULL,
	"store_id" uuid,
	"amount_rial" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "financial_ledger_transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" "ledger_transaction_kind" NOT NULL,
	"order_id" uuid NOT NULL,
	"payment_id" uuid,
	"refund_id" uuid,
	"idempotency_key" varchar(160) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment_intents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"provider" varchar(40) DEFAULT 'mock' NOT NULL,
	"provider_intent_id" varchar(160) NOT NULL,
	"status" "payment_intent_status" DEFAULT 'REQUIRES_PAYMENT' NOT NULL,
	"amount_rial" integer NOT NULL,
	"currency" varchar(3) DEFAULT 'IRR' NOT NULL,
	"idempotency_key" varchar(128) NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"last_error_code" varchar(100),
	"succeeded_at" timestamp with time zone,
	"failed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment_webhook_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" varchar(40) NOT NULL,
	"provider_event_id" varchar(180) NOT NULL,
	"event_type" varchar(80) NOT NULL,
	"payload_hash" varchar(64) NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"payment_intent_id" uuid NOT NULL,
	"provider" varchar(40) NOT NULL,
	"provider_payment_id" varchar(180) NOT NULL,
	"amount_rial" integer NOT NULL,
	"refunded_rial" integer DEFAULT 0 NOT NULL,
	"currency" varchar(3) DEFAULT 'IRR' NOT NULL,
	"status" "payment_status" NOT NULL,
	"paid_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "refunds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"payment_id" uuid NOT NULL,
	"provider" varchar(40) NOT NULL,
	"provider_refund_id" varchar(180) NOT NULL,
	"idempotency_key" varchar(128) NOT NULL,
	"amount_rial" integer NOT NULL,
	"currency" varchar(3) DEFAULT 'IRR' NOT NULL,
	"status" "refund_status" NOT NULL,
	"reason" varchar(300) NOT NULL,
	"succeeded_at" timestamp with time zone,
	"failed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "seller_balances" (
	"store_id" uuid NOT NULL,
	"pending_rial" integer DEFAULT 0 NOT NULL,
	"available_rial" integer DEFAULT 0 NOT NULL,
	"paid_out_rial" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "seller_balances_store_id_pk" PRIMARY KEY("store_id")
);
--> statement-breakpoint
ALTER TABLE "financial_ledger_postings" ADD CONSTRAINT "financial_ledger_postings_transaction_id_financial_ledger_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."financial_ledger_transactions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financial_ledger_postings" ADD CONSTRAINT "financial_ledger_postings_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financial_ledger_transactions" ADD CONSTRAINT "financial_ledger_transactions_order_id_marketplace_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."marketplace_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financial_ledger_transactions" ADD CONSTRAINT "financial_ledger_transactions_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financial_ledger_transactions" ADD CONSTRAINT "financial_ledger_transactions_refund_id_refunds_id_fk" FOREIGN KEY ("refund_id") REFERENCES "public"."refunds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_intents" ADD CONSTRAINT "payment_intents_order_id_marketplace_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."marketplace_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_order_id_marketplace_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."marketplace_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_payment_intent_id_payment_intents_id_fk" FOREIGN KEY ("payment_intent_id") REFERENCES "public"."payment_intents"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_order_id_marketplace_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."marketplace_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seller_balances" ADD CONSTRAINT "seller_balances_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "financial_ledger_postings_transaction_id_idx" ON "financial_ledger_postings" USING btree ("transaction_id");--> statement-breakpoint
CREATE INDEX "financial_ledger_postings_store_id_idx" ON "financial_ledger_postings" USING btree ("store_id");--> statement-breakpoint
CREATE UNIQUE INDEX "financial_ledger_transactions_idempotency_key_uq" ON "financial_ledger_transactions" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "financial_ledger_transactions_order_id_idx" ON "financial_ledger_transactions" USING btree ("order_id");--> statement-breakpoint
CREATE UNIQUE INDEX "payment_intents_order_id_uq" ON "payment_intents" USING btree ("order_id");--> statement-breakpoint
CREATE UNIQUE INDEX "payment_intents_provider_intent_id_uq" ON "payment_intents" USING btree ("provider_intent_id");--> statement-breakpoint
CREATE UNIQUE INDEX "payment_intents_idempotency_key_uq" ON "payment_intents" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "payment_intents_status_expires_at_idx" ON "payment_intents" USING btree ("status","expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "payment_webhook_events_provider_event_id_uq" ON "payment_webhook_events" USING btree ("provider","provider_event_id");--> statement-breakpoint
CREATE UNIQUE INDEX "payments_order_id_uq" ON "payments" USING btree ("order_id");--> statement-breakpoint
CREATE UNIQUE INDEX "payments_payment_intent_id_uq" ON "payments" USING btree ("payment_intent_id");--> statement-breakpoint
CREATE UNIQUE INDEX "payments_provider_payment_id_uq" ON "payments" USING btree ("provider","provider_payment_id");--> statement-breakpoint
CREATE UNIQUE INDEX "refunds_idempotency_key_uq" ON "refunds" USING btree ("idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "refunds_provider_refund_id_uq" ON "refunds" USING btree ("provider","provider_refund_id");--> statement-breakpoint
CREATE INDEX "refunds_order_id_idx" ON "refunds" USING btree ("order_id");