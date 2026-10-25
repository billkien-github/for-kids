ALTER TABLE "child" ADD COLUMN "sort_order" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
-- Giữ thứ tự cũ (theo ngày tạo) cho các bé đã có.
UPDATE "child" SET "sort_order" = s.rn FROM (SELECT "id", row_number() OVER (PARTITION BY "family_id" ORDER BY "created_at") AS rn FROM "child") s WHERE "child"."id" = s."id";
