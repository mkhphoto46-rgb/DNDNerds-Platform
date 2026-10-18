CREATE TYPE "public"."email_action_type" AS ENUM('VERIFY_EMAIL', 'PASSWORD_RESET');--> statement-breakpoint
CREATE TYPE "public"."payout_provider_attempt_status" AS ENUM('CREATED', 'SUCCEEDED', 'FAILED');--> statement-breakpoint
CREATE TABLE "email_action_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"type" "email_action_type" NOT NULL,
	"token_hash" varchar(64) NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payout_provider_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"payout_id" uuid NOT NULL,
	"provider" varchar(50) NOT NULL,
	"idempotency_key" varchar(180) NOT NULL,
	"status" "payout_provider_attempt_status" DEFAULT 'CREATED' NOT NULL,
	"provider_reference" varchar(220),
	"failure_reason" varchar(500),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_session_devices" (
	"session_id" uuid NOT NULL,
	"user_agent" varchar(500),
	"ip_address" varchar(80),
	"device_label" varchar(180),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_session_devices_session_id_pk" PRIMARY KEY("session_id")
);
--> statement-breakpoint
ALTER TABLE "email_action_tokens" ADD CONSTRAINT "email_action_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payout_provider_attempts" ADD CONSTRAINT "payout_provider_attempts_payout_id_seller_payout_requests_id_fk" FOREIGN KEY ("payout_id") REFERENCES "public"."seller_payout_requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_session_devices" ADD CONSTRAINT "user_session_devices_session_id_user_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."user_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "email_action_tokens_hash_uq" ON "email_action_tokens" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "email_action_tokens_user_type_idx" ON "email_action_tokens" USING btree ("user_id","type");--> statement-breakpoint
CREATE INDEX "email_action_tokens_expiry_idx" ON "email_action_tokens" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "payout_provider_attempts_idempotency_uq" ON "payout_provider_attempts" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "payout_provider_attempts_payout_idx" ON "payout_provider_attempts" USING btree ("payout_id");