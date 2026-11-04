ALTER TABLE "dm_profiles" ADD COLUMN "avatar_data" text;
--> statement-breakpoint
ALTER TABLE "dm_profiles" ADD COLUMN "banner_data" text;
--> statement-breakpoint
ALTER TABLE "dm_profiles" ADD CONSTRAINT "dm_profiles_avatar_limit" CHECK ("avatar_data" IS NULL OR octet_length("avatar_data") <= 150000);
--> statement-breakpoint
ALTER TABLE "dm_profiles" ADD CONSTRAINT "dm_profiles_banner_limit" CHECK ("banner_data" IS NULL OR octet_length("banner_data") <= 320000);
--> statement-breakpoint
CREATE TABLE "player_characters" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "public"."users"("id") ON DELETE cascade,
  "name" varchar(80) NOT NULL,
  "class_name" varchar(60) DEFAULT '' NOT NULL,
  "subclass" varchar(80) DEFAULT '' NOT NULL,
  "race" varchar(80) DEFAULT '' NOT NULL,
  "background" varchar(120) DEFAULT '' NOT NULL,
  "level" integer DEFAULT 1 NOT NULL,
  "current_hp" integer DEFAULT 1 NOT NULL,
  "max_hp" integer DEFAULT 1 NOT NULL,
  "description" text DEFAULT '' NOT NULL,
  "story" text DEFAULT '' NOT NULL,
  "portrait_data" text,
  "public" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "player_characters_level_range" CHECK ("level" BETWEEN 1 AND 20),
  CONSTRAINT "player_characters_hp_range" CHECK ("max_hp" BETWEEN 1 AND 999 AND "current_hp" BETWEEN 0 AND "max_hp"),
  CONSTRAINT "player_characters_story_length" CHECK (length("story") <= 3000),
  CONSTRAINT "player_characters_description_length" CHECK (length("description") <= 1200),
  CONSTRAINT "player_characters_portrait_limit" CHECK ("portrait_data" IS NULL OR octet_length("portrait_data") <= 270000)
);
--> statement-breakpoint
CREATE INDEX "player_characters_user_idx" ON "player_characters" USING btree ("user_id", "created_at");
