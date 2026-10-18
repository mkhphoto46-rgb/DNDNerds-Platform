CREATE TABLE "payment_provider_bindings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"payment_intent_id" uuid NOT NULL,
	"provider_key" varchar(64) NOT NULL,
	"provider_intent_id" varchar(255),
	"provider_reference" varchar(255),
	"provider_status" varchar(64),
	"provider_metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "payment_provider_bindings" ADD CONSTRAINT "payment_provider_bindings_payment_intent_id_payment_intents_id_fk" FOREIGN KEY ("payment_intent_id") REFERENCES "public"."payment_intents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "payment_provider_bindings_payment_intent_uq" ON "payment_provider_bindings" USING btree ("payment_intent_id");--> statement-breakpoint
CREATE INDEX "payment_provider_bindings_provider_idx" ON "payment_provider_bindings" USING btree ("provider_key");