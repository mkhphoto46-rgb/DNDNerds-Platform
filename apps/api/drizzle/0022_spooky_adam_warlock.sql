ALTER TABLE "game_tables" ADD COLUMN "visibility" varchar(8) DEFAULT 'PUBLIC' NOT NULL;--> statement-breakpoint
ALTER TABLE "game_tables" ADD COLUMN "invite_code_hash" varchar(64);--> statement-breakpoint
ALTER TABLE "game_tables" ADD CONSTRAINT "game_tables_visibility_valid" CHECK ("game_tables"."visibility" IN ('PUBLIC','PRIVATE'));