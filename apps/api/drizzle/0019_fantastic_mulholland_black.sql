CREATE TABLE "arena_listings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"opponent_user_id" uuid,
	"mode" varchar(4) NOT NULL,
	"title" varchar(100) NOT NULL,
	"note" varchar(500) DEFAULT '' NOT NULL,
	"status" varchar(16) DEFAULT 'OPEN' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "arena_listings_mode_valid" CHECK ("arena_listings"."mode" IN ('1V1','2V2','3V3')),
	CONSTRAINT "arena_listings_status_valid" CHECK ("arena_listings"."status" IN ('OPEN','MATCHED','CANCELLED','HIDDEN'))
);
--> statement-breakpoint
CREATE TABLE "dm_profiles" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"display_name" varchar(100) NOT NULL,
	"bio" varchar(1200) DEFAULT '' NOT NULL,
	"play_style" varchar(60) DEFAULT 'داستان‌محور' NOT NULL,
	"languages" varchar(120) DEFAULT 'فارسی' NOT NULL,
	"experience_years" integer DEFAULT 0 NOT NULL,
	"visible" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "dm_profiles_experience_range" CHECK ("dm_profiles"."experience_years" BETWEEN 0 AND 60)
);
--> statement-breakpoint
CREATE TABLE "game_applications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"table_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"note" varchar(500) DEFAULT '' NOT NULL,
	"status" varchar(16) DEFAULT 'PENDING' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "game_applications_status_valid" CHECK ("game_applications"."status" IN ('PENDING','ACCEPTED','DECLINED','WITHDRAWN'))
);
--> statement-breakpoint
CREATE TABLE "game_tables" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"host_user_id" uuid NOT NULL,
	"title" varchar(120) NOT NULL,
	"description" varchar(2000) DEFAULT '' NOT NULL,
	"system" varchar(80) DEFAULT 'D&D 5e' NOT NULL,
	"language" varchar(60) DEFAULT 'فارسی' NOT NULL,
	"play_style" varchar(60) DEFAULT 'داستان‌محور' NOT NULL,
	"level_range" varchar(60) DEFAULT '۱ تا ۵' NOT NULL,
	"schedule" varchar(160) DEFAULT 'با هماهنگی گروه' NOT NULL,
	"capacity" integer DEFAULT 4 NOT NULL,
	"status" varchar(16) DEFAULT 'DRAFT' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "game_tables_capacity_range" CHECK ("game_tables"."capacity" BETWEEN 2 AND 8),
	CONSTRAINT "game_tables_status_valid" CHECK ("game_tables"."status" IN ('DRAFT','PUBLISHED','CLOSED','HIDDEN'))
);
--> statement-breakpoint
ALTER TABLE "arena_listings" ADD CONSTRAINT "arena_listings_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "arena_listings" ADD CONSTRAINT "arena_listings_opponent_user_id_users_id_fk" FOREIGN KEY ("opponent_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dm_profiles" ADD CONSTRAINT "dm_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_applications" ADD CONSTRAINT "game_applications_table_id_game_tables_id_fk" FOREIGN KEY ("table_id") REFERENCES "public"."game_tables"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_applications" ADD CONSTRAINT "game_applications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_tables" ADD CONSTRAINT "game_tables_host_user_id_users_id_fk" FOREIGN KEY ("host_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "arena_listings_status_idx" ON "arena_listings" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "arena_listings_owner_idx" ON "arena_listings" USING btree ("owner_user_id");--> statement-breakpoint
CREATE INDEX "dm_profiles_visible_idx" ON "dm_profiles" USING btree ("visible");--> statement-breakpoint
CREATE UNIQUE INDEX "game_applications_table_user_uq" ON "game_applications" USING btree ("table_id","user_id");--> statement-breakpoint
CREATE INDEX "game_applications_user_idx" ON "game_applications" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "game_applications_table_status_idx" ON "game_applications" USING btree ("table_id","status");--> statement-breakpoint
CREATE INDEX "game_tables_status_created_idx" ON "game_tables" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "game_tables_host_idx" ON "game_tables" USING btree ("host_user_id","created_at");