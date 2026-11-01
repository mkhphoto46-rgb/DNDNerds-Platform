ALTER TABLE "dm_profiles" DROP CONSTRAINT "dm_profiles_avatar_limit", DROP CONSTRAINT "dm_profiles_banner_limit";
--> statement-breakpoint
ALTER TABLE "dm_profiles" ADD CONSTRAINT "dm_profiles_avatar_limit" CHECK ("avatar_data" IS NULL OR octet_length("avatar_data") <= 700000), ADD CONSTRAINT "dm_profiles_banner_limit" CHECK ("banner_data" IS NULL OR octet_length("banner_data") <= 1400000);
--> statement-breakpoint
ALTER TABLE "player_profiles" DROP CONSTRAINT "player_profiles_avatar_data_check", DROP CONSTRAINT "player_profiles_banner_data_check";
--> statement-breakpoint
ALTER TABLE "player_profiles" ADD CONSTRAINT "player_profiles_avatar_data_check" CHECK ("avatar_data" IS NULL OR octet_length("avatar_data") <= 700000), ADD CONSTRAINT "player_profiles_banner_data_check" CHECK ("banner_data" IS NULL OR octet_length("banner_data") <= 1400000);
--> statement-breakpoint
CREATE TABLE "site_feedback" (
 "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
 "kind" varchar(16) NOT NULL CHECK ("kind" IN ('SUGGESTION','CRITICISM','COMMENT')),
 "subject" varchar(120) NOT NULL,
 "message" varchar(3000) NOT NULL CHECK (length(btrim("message")) BETWEEN 10 AND 3000),
 "status" varchar(16) NOT NULL DEFAULT 'NEW' CHECK ("status" IN ('NEW','READ','RESOLVED')),
 "created_at" timestamptz NOT NULL DEFAULT now(), "updated_at" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX "site_feedback_user_date_idx" ON "site_feedback"("user_id","created_at");
--> statement-breakpoint
ALTER TABLE "site_feedback" ENABLE ROW LEVEL SECURITY;
