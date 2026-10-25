CREATE TYPE "public"."assigned_by" AS ENUM('parent', 'token');--> statement-breakpoint
CREATE TYPE "public"."attempt_kind" AS ENUM('normal', 'review');--> statement-breakpoint
CREATE TYPE "public"."redemption_status" AS ENUM('pending', 'approved', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."star_reason" AS ENUM('worksheet', 'review', 'badge', 'redeem', 'manual');--> statement-breakpoint
CREATE TYPE "public"."worksheet_layout" AS ENUM('one_per_screen', 'grid');--> statement-breakpoint
CREATE TYPE "public"."worksheet_source" AS ENUM('manual', 'mcp');--> statement-breakpoint
CREATE TYPE "public"."worksheet_status" AS ENUM('draft', 'published', 'archived');--> statement-breakpoint
CREATE TABLE "api_token" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"family_id" uuid NOT NULL,
	"name" text NOT NULL,
	"token_hash" text NOT NULL,
	"scopes" text[] NOT NULL,
	"last_used_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "api_token_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "asset" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"family_id" uuid NOT NULL,
	"kind" text DEFAULT 'image' NOT NULL,
	"storage_key" text NOT NULL,
	"mime" text NOT NULL,
	"bytes" integer NOT NULL,
	"sha256" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "asset_family_id_sha256_unique" UNIQUE("family_id","sha256")
);
--> statement-breakpoint
CREATE TABLE "assignment" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"worksheet_id" uuid NOT NULL,
	"child_id" uuid NOT NULL,
	"assigned_by" "assigned_by" NOT NULL,
	"due_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"cancelled_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "attempt" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"child_id" uuid NOT NULL,
	"worksheet_id" uuid,
	"assignment_id" uuid,
	"kind" "attempt_kind" DEFAULT 'normal' NOT NULL,
	"attempt_no" integer NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deadline_at" timestamp with time zone,
	"submitted_at" timestamp with time zone,
	"auto_submitted" boolean DEFAULT false NOT NULL,
	"duration_sec" integer,
	"total_points" numeric,
	"earned_points" numeric,
	"score_pct" real,
	"stars" smallint,
	CONSTRAINT "attempt_child_id_worksheet_id_attempt_no_unique" UNIQUE("child_id","worksheet_id","attempt_no")
);
--> statement-breakpoint
CREATE TABLE "attempt_answer" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"attempt_id" uuid NOT NULL,
	"question_id" uuid NOT NULL,
	"question_snapshot" jsonb NOT NULL,
	"response" jsonb,
	"score" real,
	"is_correct" boolean,
	"time_ms" integer,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "attempt_answer_attempt_id_question_id_unique" UNIQUE("attempt_id","question_id")
);
--> statement-breakpoint
CREATE TABLE "badge" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"icon" text NOT NULL,
	"rule" jsonb NOT NULL,
	"bonus_stars" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "badge_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "child" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"family_id" uuid NOT NULL,
	"name" text NOT NULL,
	"avatar" text NOT NULL,
	"grade" smallint NOT NULL,
	"pin_hash" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "child_badge" (
	"child_id" uuid NOT NULL,
	"badge_id" uuid NOT NULL,
	"earned_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "child_badge_child_id_badge_id_pk" PRIMARY KEY("child_id","badge_id")
);
--> statement-breakpoint
CREATE TABLE "family" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"timezone" text DEFAULT 'Asia/Ho_Chi_Minh' NOT NULL,
	"star_thresholds" smallint[] DEFAULT '{50,75,90}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mcp_audit" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token_id" uuid NOT NULL,
	"tool" text NOT NULL,
	"args_summary" jsonb,
	"ok" boolean NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "parent_user" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"family_id" uuid NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"parent_pin_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "parent_user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "question" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"worksheet_id" uuid NOT NULL,
	"sort_order" integer NOT NULL,
	"type" text NOT NULL,
	"body" jsonb NOT NULL,
	"explanation" text,
	"points" numeric DEFAULT 1 NOT NULL,
	"tts_lang" text
);
--> statement-breakpoint
CREATE TABLE "question_skill" (
	"question_id" uuid NOT NULL,
	"skill_id" uuid NOT NULL,
	CONSTRAINT "question_skill_question_id_skill_id_pk" PRIMARY KEY("question_id","skill_id")
);
--> statement-breakpoint
CREATE TABLE "review_item" (
	"child_id" uuid NOT NULL,
	"question_id" uuid NOT NULL,
	"box" smallint DEFAULT 1 NOT NULL,
	"due_on" date NOT NULL,
	"wrong_count" integer DEFAULT 0 NOT NULL,
	"last_answered_at" timestamp with time zone,
	CONSTRAINT "review_item_child_id_question_id_pk" PRIMARY KEY("child_id","question_id")
);
--> statement-breakpoint
CREATE TABLE "reward" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"family_id" uuid NOT NULL,
	"name" text NOT NULL,
	"icon" text NOT NULL,
	"cost_stars" integer NOT NULL,
	"active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reward_redemption" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"child_id" uuid NOT NULL,
	"reward_id" uuid NOT NULL,
	"cost_stars" integer NOT NULL,
	"status" "redemption_status" DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"decided_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"parent_user_id" uuid NOT NULL,
	"active_child_id" uuid,
	"parent_unlocked_until" timestamp with time zone,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "skill" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"family_id" uuid NOT NULL,
	"subject_id" uuid NOT NULL,
	"topic_id" uuid,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"grade" smallint,
	CONSTRAINT "skill_family_id_code_unique" UNIQUE("family_id","code")
);
--> statement-breakpoint
CREATE TABLE "skill_mastery" (
	"child_id" uuid NOT NULL,
	"skill_id" uuid NOT NULL,
	"mastery" real NOT NULL,
	"answered" integer DEFAULT 0 NOT NULL,
	"correct" integer DEFAULT 0 NOT NULL,
	"last_seen_at" timestamp with time zone,
	CONSTRAINT "skill_mastery_child_id_skill_id_pk" PRIMARY KEY("child_id","skill_id")
);
--> statement-breakpoint
CREATE TABLE "star_ledger" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"child_id" uuid NOT NULL,
	"delta" integer NOT NULL,
	"reason" "star_reason" NOT NULL,
	"ref_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subject" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"family_id" uuid,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"tts_lang" text NOT NULL,
	CONSTRAINT "subject_family_id_code_unique" UNIQUE NULLS NOT DISTINCT("family_id","code")
);
--> statement-breakpoint
CREATE TABLE "topic" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"family_id" uuid NOT NULL,
	"subject_id" uuid NOT NULL,
	"grade_min" smallint NOT NULL,
	"grade_max" smallint NOT NULL,
	"name" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "topic_family_id_subject_id_name_unique" UNIQUE("family_id","subject_id","name")
);
--> statement-breakpoint
CREATE TABLE "worksheet" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"family_id" uuid NOT NULL,
	"subject_id" uuid NOT NULL,
	"topic_id" uuid,
	"grade" smallint NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"lang" text,
	"layout" "worksheet_layout" DEFAULT 'one_per_screen' NOT NULL,
	"status" "worksheet_status" DEFAULT 'draft' NOT NULL,
	"source" "worksheet_source" NOT NULL,
	"source_note" text,
	"time_limit_sec" integer,
	"created_by_token_id" uuid,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "api_token" ADD CONSTRAINT "api_token_family_id_family_id_fk" FOREIGN KEY ("family_id") REFERENCES "public"."family"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset" ADD CONSTRAINT "asset_family_id_family_id_fk" FOREIGN KEY ("family_id") REFERENCES "public"."family"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assignment" ADD CONSTRAINT "assignment_worksheet_id_worksheet_id_fk" FOREIGN KEY ("worksheet_id") REFERENCES "public"."worksheet"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assignment" ADD CONSTRAINT "assignment_child_id_child_id_fk" FOREIGN KEY ("child_id") REFERENCES "public"."child"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attempt" ADD CONSTRAINT "attempt_child_id_child_id_fk" FOREIGN KEY ("child_id") REFERENCES "public"."child"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attempt" ADD CONSTRAINT "attempt_worksheet_id_worksheet_id_fk" FOREIGN KEY ("worksheet_id") REFERENCES "public"."worksheet"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attempt" ADD CONSTRAINT "attempt_assignment_id_assignment_id_fk" FOREIGN KEY ("assignment_id") REFERENCES "public"."assignment"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attempt_answer" ADD CONSTRAINT "attempt_answer_attempt_id_attempt_id_fk" FOREIGN KEY ("attempt_id") REFERENCES "public"."attempt"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attempt_answer" ADD CONSTRAINT "attempt_answer_question_id_question_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."question"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "child" ADD CONSTRAINT "child_family_id_family_id_fk" FOREIGN KEY ("family_id") REFERENCES "public"."family"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "child_badge" ADD CONSTRAINT "child_badge_child_id_child_id_fk" FOREIGN KEY ("child_id") REFERENCES "public"."child"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "child_badge" ADD CONSTRAINT "child_badge_badge_id_badge_id_fk" FOREIGN KEY ("badge_id") REFERENCES "public"."badge"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mcp_audit" ADD CONSTRAINT "mcp_audit_token_id_api_token_id_fk" FOREIGN KEY ("token_id") REFERENCES "public"."api_token"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parent_user" ADD CONSTRAINT "parent_user_family_id_family_id_fk" FOREIGN KEY ("family_id") REFERENCES "public"."family"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question" ADD CONSTRAINT "question_worksheet_id_worksheet_id_fk" FOREIGN KEY ("worksheet_id") REFERENCES "public"."worksheet"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_skill" ADD CONSTRAINT "question_skill_question_id_question_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."question"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_skill" ADD CONSTRAINT "question_skill_skill_id_skill_id_fk" FOREIGN KEY ("skill_id") REFERENCES "public"."skill"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_item" ADD CONSTRAINT "review_item_child_id_child_id_fk" FOREIGN KEY ("child_id") REFERENCES "public"."child"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_item" ADD CONSTRAINT "review_item_question_id_question_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."question"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reward" ADD CONSTRAINT "reward_family_id_family_id_fk" FOREIGN KEY ("family_id") REFERENCES "public"."family"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reward_redemption" ADD CONSTRAINT "reward_redemption_child_id_child_id_fk" FOREIGN KEY ("child_id") REFERENCES "public"."child"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reward_redemption" ADD CONSTRAINT "reward_redemption_reward_id_reward_id_fk" FOREIGN KEY ("reward_id") REFERENCES "public"."reward"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_parent_user_id_parent_user_id_fk" FOREIGN KEY ("parent_user_id") REFERENCES "public"."parent_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_active_child_id_child_id_fk" FOREIGN KEY ("active_child_id") REFERENCES "public"."child"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skill" ADD CONSTRAINT "skill_family_id_family_id_fk" FOREIGN KEY ("family_id") REFERENCES "public"."family"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skill" ADD CONSTRAINT "skill_subject_id_subject_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."subject"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skill" ADD CONSTRAINT "skill_topic_id_topic_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."topic"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skill_mastery" ADD CONSTRAINT "skill_mastery_child_id_child_id_fk" FOREIGN KEY ("child_id") REFERENCES "public"."child"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skill_mastery" ADD CONSTRAINT "skill_mastery_skill_id_skill_id_fk" FOREIGN KEY ("skill_id") REFERENCES "public"."skill"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "star_ledger" ADD CONSTRAINT "star_ledger_child_id_child_id_fk" FOREIGN KEY ("child_id") REFERENCES "public"."child"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subject" ADD CONSTRAINT "subject_family_id_family_id_fk" FOREIGN KEY ("family_id") REFERENCES "public"."family"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "topic" ADD CONSTRAINT "topic_family_id_family_id_fk" FOREIGN KEY ("family_id") REFERENCES "public"."family"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "topic" ADD CONSTRAINT "topic_subject_id_subject_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."subject"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "worksheet" ADD CONSTRAINT "worksheet_family_id_family_id_fk" FOREIGN KEY ("family_id") REFERENCES "public"."family"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "worksheet" ADD CONSTRAINT "worksheet_subject_id_subject_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."subject"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "worksheet" ADD CONSTRAINT "worksheet_topic_id_topic_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."topic"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "worksheet" ADD CONSTRAINT "worksheet_created_by_token_id_api_token_id_fk" FOREIGN KEY ("created_by_token_id") REFERENCES "public"."api_token"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "assignment_child_id_due_at_index" ON "assignment" USING btree ("child_id","due_at");--> statement-breakpoint
CREATE INDEX "attempt_child_id_submitted_at_index" ON "attempt" USING btree ("child_id","submitted_at");--> statement-breakpoint
CREATE INDEX "mcp_audit_token_id_created_at_index" ON "mcp_audit" USING btree ("token_id","created_at");--> statement-breakpoint
CREATE INDEX "question_worksheet_id_sort_order_index" ON "question" USING btree ("worksheet_id","sort_order");--> statement-breakpoint
CREATE INDEX "review_item_child_id_due_on_index" ON "review_item" USING btree ("child_id","due_on");--> statement-breakpoint
CREATE INDEX "star_ledger_child_id_created_at_index" ON "star_ledger" USING btree ("child_id","created_at");--> statement-breakpoint
CREATE INDEX "worksheet_family_id_status_subject_id_index" ON "worksheet" USING btree ("family_id","status","subject_id");