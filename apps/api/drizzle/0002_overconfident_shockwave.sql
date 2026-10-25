ALTER TABLE "child_badge" ADD COLUMN IF NOT EXISTS "attempt_id" uuid;--> statement-breakpoint
ALTER TABLE "star_ledger" ADD COLUMN IF NOT EXISTS "note" text;--> statement-breakpoint
ALTER TABLE "child_badge" ADD CONSTRAINT "child_badge_attempt_id_attempt_id_fk" FOREIGN KEY ("attempt_id") REFERENCES "public"."attempt"("id") ON DELETE set null ON UPDATE no action;