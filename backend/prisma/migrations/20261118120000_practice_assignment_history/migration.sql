ALTER TABLE "practice_assignments" ADD COLUMN "archived_at" TIMESTAMPTZ(3);
ALTER TABLE "practice_assignments" ADD CONSTRAINT "practice_assignment_archive_date"
  CHECK ("archived_at" IS NULL OR "archived");
