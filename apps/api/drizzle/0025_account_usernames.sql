ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "username" varchar(32);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "users_username_lower_unique" ON "users" (lower("username")) WHERE "username" IS NOT NULL;
