CREATE TABLE "game_table_reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"table_id" uuid NOT NULL,
	"reviewer_user_id" uuid NOT NULL,
	"rating" integer NOT NULL,
	"comment" varchar(1200) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "game_table_reviews_rating_range" CHECK ("game_table_reviews"."rating" BETWEEN 1 AND 5),
	CONSTRAINT "game_table_reviews_comment_length" CHECK (length(btrim("game_table_reviews"."comment")) BETWEEN 10 AND 1200)
);
--> statement-breakpoint
ALTER TABLE "game_table_reviews" ADD CONSTRAINT "game_table_reviews_table_id_game_tables_id_fk" FOREIGN KEY ("table_id") REFERENCES "public"."game_tables"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_table_reviews" ADD CONSTRAINT "game_table_reviews_reviewer_user_id_users_id_fk" FOREIGN KEY ("reviewer_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "game_table_reviews_table_reviewer_uq" ON "game_table_reviews" USING btree ("table_id","reviewer_user_id");--> statement-breakpoint
CREATE INDEX "game_table_reviews_table_date_idx" ON "game_table_reviews" USING btree ("table_id","created_at");