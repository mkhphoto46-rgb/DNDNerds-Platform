CREATE TABLE "game_subscription_grants" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid,
  "email" varchar(320) NOT NULL,
  "starts_at" timestamp with time zone DEFAULT now() NOT NULL,
  "ends_at" timestamp with time zone NOT NULL,
  "revoked_at" timestamp with time zone,
  "created_by_user_id" uuid NOT NULL,
  "reason" varchar(500) NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "game_subscription_grants_period_valid" CHECK ("ends_at" > "starts_at")
);
--> statement-breakpoint
ALTER TABLE "game_subscription_grants" ADD CONSTRAINT "game_subscription_grants_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null;
--> statement-breakpoint
ALTER TABLE "game_subscription_grants" ADD CONSTRAINT "game_subscription_grants_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict;
--> statement-breakpoint
CREATE INDEX "game_subscription_grants_user_idx" ON "game_subscription_grants" USING btree ("user_id", "ends_at");
--> statement-breakpoint
CREATE INDEX "game_subscription_grants_email_idx" ON "game_subscription_grants" USING btree ("email", "ends_at");
--> statement-breakpoint
CREATE TABLE "game_subscription_settings" (
  "id" integer PRIMARY KEY NOT NULL,
  "price_rial" integer DEFAULT 5990000 NOT NULL,
  "updated_by_user_id" uuid,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "game_subscription_settings_singleton" CHECK ("id" = 1),
  CONSTRAINT "game_subscription_settings_price_valid" CHECK ("price_rial" > 0)
);
--> statement-breakpoint
ALTER TABLE "game_subscription_settings" ADD CONSTRAINT "game_subscription_settings_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null;
--> statement-breakpoint
INSERT INTO "game_subscription_settings" ("id", "price_rial") VALUES (1, 5990000);
