CREATE TABLE "social_blocks" (
	"blocker_user_id" uuid NOT NULL,
	"blocked_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "social_blocks_no_self" CHECK ("social_blocks"."blocker_user_id" <> "social_blocks"."blocked_user_id")
);
--> statement-breakpoint
CREATE TABLE "social_friend_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sender_user_id" uuid NOT NULL,
	"receiver_user_id" uuid NOT NULL,
	"status" varchar(16) DEFAULT 'PENDING' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"responded_at" timestamp with time zone,
	CONSTRAINT "social_friend_requests_no_self" CHECK ("social_friend_requests"."sender_user_id" <> "social_friend_requests"."receiver_user_id"),
	CONSTRAINT "social_friend_requests_status_valid" CHECK ("social_friend_requests"."status" IN ('PENDING','ACCEPTED','DECLINED'))
);
--> statement-breakpoint
CREATE TABLE "social_friendships" (
	"lower_user_id" uuid NOT NULL,
	"upper_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "social_friendships_ordered_pair" CHECK ("social_friendships"."lower_user_id" < "social_friendships"."upper_user_id")
);
--> statement-breakpoint
CREATE TABLE "social_group_invites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"group_id" uuid NOT NULL,
	"sender_user_id" uuid NOT NULL,
	"invited_user_id" uuid NOT NULL,
	"status" varchar(16) DEFAULT 'PENDING' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"responded_at" timestamp with time zone,
	CONSTRAINT "social_group_invites_no_self" CHECK ("social_group_invites"."sender_user_id" <> "social_group_invites"."invited_user_id"),
	CONSTRAINT "social_group_invites_status_valid" CHECK ("social_group_invites"."status" IN ('PENDING','ACCEPTED','DECLINED'))
);
--> statement-breakpoint
CREATE TABLE "social_group_members" (
	"group_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "social_group_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"group_id" uuid NOT NULL,
	"sender_user_id" uuid NOT NULL,
	"body" varchar(2000) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "social_group_messages_body_length" CHECK (length(btrim("social_group_messages"."body")) BETWEEN 1 AND 2000)
);
--> statement-breakpoint
CREATE TABLE "social_groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" varchar(80) NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "social_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sender_user_id" uuid NOT NULL,
	"receiver_user_id" uuid NOT NULL,
	"body" varchar(2000) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "social_messages_no_self" CHECK ("social_messages"."sender_user_id" <> "social_messages"."receiver_user_id"),
	CONSTRAINT "social_messages_body_length" CHECK (length(btrim("social_messages"."body")) BETWEEN 1 AND 2000)
);
--> statement-breakpoint
CREATE TABLE "social_profiles" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"friend_code" varchar(32) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "social_profiles_friend_code_unique" UNIQUE("friend_code")
);
--> statement-breakpoint
ALTER TABLE "social_blocks" ADD CONSTRAINT "social_blocks_blocker_user_id_users_id_fk" FOREIGN KEY ("blocker_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social_blocks" ADD CONSTRAINT "social_blocks_blocked_user_id_users_id_fk" FOREIGN KEY ("blocked_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social_friend_requests" ADD CONSTRAINT "social_friend_requests_sender_user_id_users_id_fk" FOREIGN KEY ("sender_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social_friend_requests" ADD CONSTRAINT "social_friend_requests_receiver_user_id_users_id_fk" FOREIGN KEY ("receiver_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social_friendships" ADD CONSTRAINT "social_friendships_lower_user_id_users_id_fk" FOREIGN KEY ("lower_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social_friendships" ADD CONSTRAINT "social_friendships_upper_user_id_users_id_fk" FOREIGN KEY ("upper_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social_group_invites" ADD CONSTRAINT "social_group_invites_group_id_social_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."social_groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social_group_invites" ADD CONSTRAINT "social_group_invites_sender_user_id_users_id_fk" FOREIGN KEY ("sender_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social_group_invites" ADD CONSTRAINT "social_group_invites_invited_user_id_users_id_fk" FOREIGN KEY ("invited_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social_group_members" ADD CONSTRAINT "social_group_members_group_id_social_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."social_groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social_group_members" ADD CONSTRAINT "social_group_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social_group_messages" ADD CONSTRAINT "social_group_messages_group_id_social_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."social_groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social_group_messages" ADD CONSTRAINT "social_group_messages_sender_user_id_users_id_fk" FOREIGN KEY ("sender_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social_groups" ADD CONSTRAINT "social_groups_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social_messages" ADD CONSTRAINT "social_messages_sender_user_id_users_id_fk" FOREIGN KEY ("sender_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social_messages" ADD CONSTRAINT "social_messages_receiver_user_id_users_id_fk" FOREIGN KEY ("receiver_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social_profiles" ADD CONSTRAINT "social_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "social_blocks_unique_direction" ON "social_blocks" USING btree ("blocker_user_id","blocked_user_id");--> statement-breakpoint
CREATE INDEX "social_blocks_blocked_idx" ON "social_blocks" USING btree ("blocked_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "social_friend_requests_unique_direction" ON "social_friend_requests" USING btree ("sender_user_id","receiver_user_id");--> statement-breakpoint
CREATE INDEX "social_friend_requests_receiver_status_idx" ON "social_friend_requests" USING btree ("receiver_user_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "social_friendships_unique_pair" ON "social_friendships" USING btree ("lower_user_id","upper_user_id");--> statement-breakpoint
CREATE INDEX "social_friendships_upper_idx" ON "social_friendships" USING btree ("upper_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "social_group_invites_group_target_unique" ON "social_group_invites" USING btree ("group_id","invited_user_id");--> statement-breakpoint
CREATE INDEX "social_group_invites_invited_status_idx" ON "social_group_invites" USING btree ("invited_user_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "social_group_members_pair_unique" ON "social_group_members" USING btree ("group_id","user_id");--> statement-breakpoint
CREATE INDEX "social_group_members_user_idx" ON "social_group_members" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "social_group_messages_group_date_idx" ON "social_group_messages" USING btree ("group_id","created_at");--> statement-breakpoint
CREATE INDEX "social_group_messages_sender_date_idx" ON "social_group_messages" USING btree ("sender_user_id","created_at");--> statement-breakpoint
CREATE INDEX "social_messages_sender_idx" ON "social_messages" USING btree ("sender_user_id","created_at");--> statement-breakpoint
CREATE INDEX "social_messages_receiver_idx" ON "social_messages" USING btree ("receiver_user_id","created_at");