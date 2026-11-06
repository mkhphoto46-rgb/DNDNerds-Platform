CREATE TABLE "knowledge_homebrew" (
 "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
 "author_user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
 "title" varchar(160) NOT NULL, "summary" varchar(500) NOT NULL,
 "body" text NOT NULL, "kind" varchar(20) NOT NULL,
 "status" varchar(16) DEFAULT 'DRAFT' NOT NULL,
 "created_at" timestamptz DEFAULT now() NOT NULL,
 "updated_at" timestamptz DEFAULT now() NOT NULL,
 CONSTRAINT "knowledge_homebrew_status_valid" CHECK ("status" IN ('DRAFT','PUBLISHED')),
 CONSTRAINT "knowledge_homebrew_kind_valid" CHECK ("kind" IN ('ITEM','CHARACTER','CREATURE','STORY','RULE','OTHER'))
);
--> statement-breakpoint
CREATE INDEX "knowledge_homebrew_public_idx" ON "knowledge_homebrew" ("status", "created_at");
--> statement-breakpoint
CREATE INDEX "knowledge_homebrew_author_idx" ON "knowledge_homebrew" ("author_user_id", "updated_at");
