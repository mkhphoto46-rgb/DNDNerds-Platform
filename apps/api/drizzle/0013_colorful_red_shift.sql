CREATE TYPE "public"."refund_case_reason" AS ENUM('DAMAGED', 'DEFECTIVE', 'WRONG_ITEM', 'MISSING_ITEM', 'NOT_AS_DESCRIBED', 'OTHER');--> statement-breakpoint
CREATE TYPE "public"."refund_case_status" AS ENUM('REQUESTED', 'EVIDENCE_REQUIRED', 'CONTACT_REQUIRED', 'UNDER_REVIEW', 'SELLER_RESPONSE', 'RETURN_REQUIRED', 'APPROVED', 'REJECTED', 'REFUND_PROCESSING', 'REFUNDED', 'CLOSED');--> statement-breakpoint
CREATE TABLE "marketplace_refund_case_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"case_id" uuid NOT NULL,
	"actor_user_id" uuid,
	"actor_role" varchar(40) NOT NULL,
	"event_type" varchar(100) NOT NULL,
	"details" varchar(1800),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "marketplace_refund_case_evidence" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"case_id" uuid NOT NULL,
	"uploaded_by_user_id" uuid NOT NULL,
	"storage_key" varchar(500) NOT NULL,
	"original_name" varchar(240) NOT NULL,
	"mime_type" varchar(120) NOT NULL,
	"size_bytes" integer NOT NULL,
	"sha256" varchar(64) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "marketplace_refund_cases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"seller_order_id" uuid NOT NULL,
	"store_id" uuid NOT NULL,
	"buyer_user_id" uuid NOT NULL,
	"reason" "refund_case_reason" NOT NULL,
	"description" text NOT NULL,
	"status" "refund_case_status" DEFAULT 'EVIDENCE_REQUIRED' NOT NULL,
	"seller_response" text,
	"seller_responded_by_user_id" uuid,
	"seller_responded_at" timestamp with time zone,
	"contact_confirmed_by_admin_user_id" uuid,
	"contact_confirmed_at" timestamp with time zone,
	"decided_by_admin_user_id" uuid,
	"decision_reason" text,
	"return_required" boolean DEFAULT false NOT NULL,
	"decided_at" timestamp with time zone,
	"financial_refund_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "marketplace_refund_policy" (
	"id" varchar(32) PRIMARY KEY NOT NULL,
	"evidence_required" boolean DEFAULT true NOT NULL,
	"minimum_evidence_count" integer DEFAULT 1 NOT NULL,
	"support_contact_required" boolean DEFAULT true NOT NULL,
	"seller_response_hours" integer DEFAULT 48 NOT NULL,
	"auto_refund" boolean DEFAULT false NOT NULL,
	"request_window_days" integer,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "marketplace_refund_case_events" ADD CONSTRAINT "marketplace_refund_case_events_case_id_marketplace_refund_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."marketplace_refund_cases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketplace_refund_case_events" ADD CONSTRAINT "marketplace_refund_case_events_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketplace_refund_case_evidence" ADD CONSTRAINT "marketplace_refund_case_evidence_case_id_marketplace_refund_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."marketplace_refund_cases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketplace_refund_case_evidence" ADD CONSTRAINT "marketplace_refund_case_evidence_uploaded_by_user_id_users_id_fk" FOREIGN KEY ("uploaded_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketplace_refund_cases" ADD CONSTRAINT "marketplace_refund_cases_order_id_marketplace_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."marketplace_orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketplace_refund_cases" ADD CONSTRAINT "marketplace_refund_cases_seller_order_id_marketplace_seller_orders_id_fk" FOREIGN KEY ("seller_order_id") REFERENCES "public"."marketplace_seller_orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketplace_refund_cases" ADD CONSTRAINT "marketplace_refund_cases_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketplace_refund_cases" ADD CONSTRAINT "marketplace_refund_cases_buyer_user_id_users_id_fk" FOREIGN KEY ("buyer_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketplace_refund_cases" ADD CONSTRAINT "marketplace_refund_cases_seller_responded_by_user_id_users_id_fk" FOREIGN KEY ("seller_responded_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketplace_refund_cases" ADD CONSTRAINT "marketplace_refund_cases_contact_confirmed_by_admin_user_id_users_id_fk" FOREIGN KEY ("contact_confirmed_by_admin_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketplace_refund_cases" ADD CONSTRAINT "marketplace_refund_cases_decided_by_admin_user_id_users_id_fk" FOREIGN KEY ("decided_by_admin_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "marketplace_refund_case_events_case_idx" ON "marketplace_refund_case_events" USING btree ("case_id");--> statement-breakpoint
CREATE INDEX "marketplace_refund_case_evidence_case_idx" ON "marketplace_refund_case_evidence" USING btree ("case_id");--> statement-breakpoint
CREATE INDEX "marketplace_refund_cases_order_idx" ON "marketplace_refund_cases" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "marketplace_refund_cases_seller_order_idx" ON "marketplace_refund_cases" USING btree ("seller_order_id");--> statement-breakpoint
CREATE INDEX "marketplace_refund_cases_store_idx" ON "marketplace_refund_cases" USING btree ("store_id");--> statement-breakpoint
CREATE INDEX "marketplace_refund_cases_buyer_idx" ON "marketplace_refund_cases" USING btree ("buyer_user_id");--> statement-breakpoint
CREATE INDEX "marketplace_refund_cases_status_idx" ON "marketplace_refund_cases" USING btree ("status");