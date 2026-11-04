CREATE TABLE "user_xp" (
  "user_id" uuid PRIMARY KEY NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "total_xp" bigint NOT NULL DEFAULT 1000,
  "active_seconds" integer NOT NULL DEFAULT 0,
  "last_heartbeat_at" timestamp with time zone,
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "user_xp_nonnegative" CHECK ("total_xp" >= 1000),
  CONSTRAINT "user_xp_active_seconds_range" CHECK ("active_seconds" BETWEEN 0 AND 599)
);
--> statement-breakpoint
CREATE TABLE "user_xp_awards" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "source" varchar(32) NOT NULL,
  "source_id" varchar(128) NOT NULL,
  "amount" integer NOT NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "user_xp_awards_positive" CHECK ("amount" > 0),
  CONSTRAINT "user_xp_awards_source_unique" UNIQUE ("source", "source_id")
);
--> statement-breakpoint
CREATE INDEX "user_xp_awards_user_date_idx" ON "user_xp_awards" ("user_id", "created_at");
