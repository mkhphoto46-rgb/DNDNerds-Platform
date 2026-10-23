CREATE TABLE "game_table_invites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"table_id" uuid NOT NULL,
	"sender_user_id" uuid NOT NULL,
	"invited_user_id" uuid NOT NULL,
	"role" varchar(12) DEFAULT 'player' NOT NULL,
	"status" varchar(16) DEFAULT 'PENDING' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"responded_at" timestamp with time zone,
	CONSTRAINT "game_table_invites_no_self" CHECK ("game_table_invites"."sender_user_id" <> "game_table_invites"."invited_user_id"),
	CONSTRAINT "game_table_invites_role_valid" CHECK ("game_table_invites"."role" IN ('player','observer')),
	CONSTRAINT "game_table_invites_status_valid" CHECK ("game_table_invites"."status" IN ('PENDING','ACCEPTED','DECLINED'))
);
--> statement-breakpoint
CREATE TABLE "game_table_members" (
	"table_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" varchar(12) NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "game_table_members_role_valid" CHECK ("game_table_members"."role" IN ('dm','player','observer'))
);
--> statement-breakpoint
CREATE TABLE "game_tables" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(80) NOT NULL,
	"edition" varchar(8) DEFAULT '2024' NOT NULL,
	"dm_user_id" uuid NOT NULL,
	"vtt_instance_id" uuid,
	"vtt_campaign_id" varchar(120),
	"join_code" varchar(16) NOT NULL,
	"max_players" integer DEFAULT 6 NOT NULL,
	"allow_observer" boolean DEFAULT true NOT NULL,
	"first_launched_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "game_tables_edition_valid" CHECK ("game_tables"."edition" IN ('2014','2024','mixed')),
	CONSTRAINT "game_tables_max_players" CHECK ("game_tables"."max_players" BETWEEN 1 AND 9),
	CONSTRAINT "game_tables_name_length" CHECK (length(btrim("game_tables"."name")) BETWEEN 2 AND 80)
);
--> statement-breakpoint
CREATE TABLE "player_profiles" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"display_name" varchar(32) NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "player_profiles_display_name_length" CHECK (length(btrim("player_profiles"."display_name")) BETWEEN 2 AND 32)
);
--> statement-breakpoint
CREATE TABLE "vtt_instances" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"name" varchar(80) NOT NULL,
	"base_url" varchar(300) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vtt_launch_tickets" (
	"jti" uuid PRIMARY KEY NOT NULL,
	"table_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"vtt_instance_id" uuid NOT NULL,
	"role" varchar(12) NOT NULL,
	"issued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "vtt_launch_tickets_role_valid" CHECK ("vtt_launch_tickets"."role" IN ('dm','player','observer'))
);
--> statement-breakpoint
ALTER TABLE "game_table_invites" ADD CONSTRAINT "game_table_invites_table_id_game_tables_id_fk" FOREIGN KEY ("table_id") REFERENCES "public"."game_tables"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_table_invites" ADD CONSTRAINT "game_table_invites_sender_user_id_users_id_fk" FOREIGN KEY ("sender_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_table_invites" ADD CONSTRAINT "game_table_invites_invited_user_id_users_id_fk" FOREIGN KEY ("invited_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_table_members" ADD CONSTRAINT "game_table_members_table_id_game_tables_id_fk" FOREIGN KEY ("table_id") REFERENCES "public"."game_tables"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_table_members" ADD CONSTRAINT "game_table_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_tables" ADD CONSTRAINT "game_tables_dm_user_id_users_id_fk" FOREIGN KEY ("dm_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_tables" ADD CONSTRAINT "game_tables_vtt_instance_id_vtt_instances_id_fk" FOREIGN KEY ("vtt_instance_id") REFERENCES "public"."vtt_instances"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_profiles" ADD CONSTRAINT "player_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vtt_instances" ADD CONSTRAINT "vtt_instances_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vtt_launch_tickets" ADD CONSTRAINT "vtt_launch_tickets_table_id_game_tables_id_fk" FOREIGN KEY ("table_id") REFERENCES "public"."game_tables"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vtt_launch_tickets" ADD CONSTRAINT "vtt_launch_tickets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vtt_launch_tickets" ADD CONSTRAINT "vtt_launch_tickets_vtt_instance_id_vtt_instances_id_fk" FOREIGN KEY ("vtt_instance_id") REFERENCES "public"."vtt_instances"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "game_table_invites_table_target_unique" ON "game_table_invites" USING btree ("table_id","invited_user_id");--> statement-breakpoint
CREATE INDEX "game_table_invites_invited_status_idx" ON "game_table_invites" USING btree ("invited_user_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "game_table_members_pair_unique" ON "game_table_members" USING btree ("table_id","user_id");--> statement-breakpoint
CREATE INDEX "game_table_members_user_idx" ON "game_table_members" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "game_tables_join_code_unique" ON "game_tables" USING btree ("join_code");--> statement-breakpoint
CREATE INDEX "game_tables_dm_idx" ON "game_tables" USING btree ("dm_user_id");--> statement-breakpoint
CREATE INDEX "vtt_instances_owner_idx" ON "vtt_instances" USING btree ("owner_user_id");--> statement-breakpoint
CREATE INDEX "vtt_launch_tickets_table_idx" ON "vtt_launch_tickets" USING btree ("table_id","issued_at");