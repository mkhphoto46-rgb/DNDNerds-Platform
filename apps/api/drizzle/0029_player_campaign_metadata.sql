CREATE TABLE "player_profiles" (
 "user_id" uuid PRIMARY KEY REFERENCES "users"("id") ON DELETE CASCADE,
 "display_name" varchar(100) NOT NULL,
 "bio" varchar(1200) NOT NULL DEFAULT '',
 "avatar_data" text CHECK ("avatar_data" IS NULL OR octet_length("avatar_data") <= 150000),
 "banner_data" text CHECK ("banner_data" IS NULL OR octet_length("banner_data") <= 320000),
 "updated_at" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "game_tables" ADD COLUMN "genres" jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof("genres") = 'array' AND jsonb_array_length("genres") <= 4);
--> statement-breakpoint
ALTER TABLE "game_tables" ADD COLUMN "image_data" text CHECK ("image_data" IS NULL OR octet_length("image_data") <= 140000);
--> statement-breakpoint
ALTER TABLE "player_profiles" ENABLE ROW LEVEL SECURITY;
