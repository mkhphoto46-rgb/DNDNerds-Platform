CREATE TABLE "site_posts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"author_user_id" uuid NOT NULL,
	"title" varchar(160) NOT NULL,
	"summary" varchar(500) NOT NULL,
	"body" text NOT NULL,
	"status" varchar(16) DEFAULT 'DRAFT' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "site_posts_status_valid" CHECK ("site_posts"."status" IN ('DRAFT','PUBLISHED'))
);
--> statement-breakpoint
ALTER TABLE "site_posts" ADD CONSTRAINT "site_posts_author_user_id_users_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "site_posts_status_created_idx" ON "site_posts" USING btree ("status","created_at");