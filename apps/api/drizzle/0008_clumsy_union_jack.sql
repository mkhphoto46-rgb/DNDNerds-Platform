ALTER TYPE "public"."payout_provider_attempt_status" ADD VALUE 'PROCESSING' BEFORE 'SUCCEEDED';--> statement-breakpoint
ALTER TYPE "public"."seller_payout_status" ADD VALUE 'PROCESSING' BEFORE 'REJECTED';--> statement-breakpoint
ALTER TABLE "marketplace_orders" ADD COLUMN "request_hash" varchar(64);--> statement-breakpoint
ALTER TABLE "seller_balances" ADD COLUMN "negative_rial" integer DEFAULT 0 NOT NULL;