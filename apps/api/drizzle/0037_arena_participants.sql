-- B55: 2V2 and 3V3 invitations need more than one opponent. Each joiner gets a row;
-- arena_listings.opponent_user_id stays as the first joiner for older readers.
CREATE TABLE IF NOT EXISTS "arena_participants" (
	"listing_id" uuid NOT NULL REFERENCES "arena_listings"("id") ON DELETE cascade,
	"user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "arena_participants_pk" PRIMARY KEY ("listing_id", "user_id")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "arena_participants_user_idx" ON "arena_participants" ("user_id");
--> statement-breakpoint
INSERT INTO "arena_participants" ("listing_id", "user_id", "joined_at")
SELECT "id", "opponent_user_id", "updated_at" FROM "arena_listings" WHERE "opponent_user_id" IS NOT NULL
ON CONFLICT DO NOTHING;
