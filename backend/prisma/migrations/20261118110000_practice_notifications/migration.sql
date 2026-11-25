CREATE TABLE "practice_notifications" (
  "id" UUID PRIMARY KEY,
  "user_id" UUID NOT NULL REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "title" VARCHAR(120) NOT NULL,
  "message" VARCHAR(400) NOT NULL,
  "link" VARCHAR(240) NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "read_at" TIMESTAMPTZ(3),
  CHECK (length(trim("title")) > 0 AND "link" LIKE '/practice/%')
);

CREATE INDEX "practice_notifications_user_id_created_at_id_idx" ON "practice_notifications"("user_id", "created_at", "id");
CREATE INDEX "practice_notifications_user_id_read_at_idx" ON "practice_notifications"("user_id", "read_at");

ALTER TABLE "practice_assignments" ADD COLUMN "auto_reminded_at" TIMESTAMPTZ(3);
CREATE INDEX "practice_assignments_reminder_due_idx" ON "practice_assignments"("due_at", "id")
  WHERE NOT "archived" AND "auto_reminded_at" IS NULL;
