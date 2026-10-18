ALTER TABLE "marketplace_refund_cases" ADD COLUMN "refund_amount_rial" integer;--> statement-breakpoint
ALTER TABLE "marketplace_refund_cases" ADD COLUMN "commission_reversal_rial" integer;--> statement-breakpoint
ALTER TABLE "marketplace_refund_cases" ADD COLUMN "seller_net_reversal_rial" integer;--> statement-breakpoint
ALTER TABLE "marketplace_refund_cases" ADD COLUMN "financial_plan_created_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "marketplace_refund_cases" ADD COLUMN "return_received_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "marketplace_refund_cases" ADD COLUMN "return_received_by_admin_user_id" uuid;--> statement-breakpoint
ALTER TABLE "marketplace_refund_cases" ADD COLUMN "return_note" text;--> statement-breakpoint
ALTER TABLE "marketplace_refund_cases" ADD CONSTRAINT "marketplace_refund_cases_return_received_by_admin_user_id_users_id_fk" FOREIGN KEY ("return_received_by_admin_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;