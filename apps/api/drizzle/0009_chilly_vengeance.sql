ALTER TABLE "payment_intents" ALTER COLUMN "provider" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "payment_intents" ALTER COLUMN "provider_intent_id" DROP NOT NULL;