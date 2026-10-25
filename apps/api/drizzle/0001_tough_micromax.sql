ALTER TABLE "attempt_answer" DROP CONSTRAINT "attempt_answer_question_id_question_id_fk";
--> statement-breakpoint
ALTER TABLE "attempt_answer" ALTER COLUMN "question_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "attempt_answer" ADD CONSTRAINT "attempt_answer_question_id_question_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."question"("id") ON DELETE set null ON UPDATE no action;