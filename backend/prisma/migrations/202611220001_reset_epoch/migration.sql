CREATE TABLE "practice_progress_epochs" (
  "user_id" UUID PRIMARY KEY REFERENCES "users"("id") ON DELETE CASCADE,
  "reset_id" UUID NOT NULL REFERENCES "practice_progress_resets"("id") ON DELETE CASCADE,
  "reset_at" TIMESTAMPTZ(3) NOT NULL
);
INSERT INTO "practice_progress_epochs" ("user_id", "reset_id", "reset_at")
SELECT DISTINCT ON ("user_id") "user_id", "id", "reset_at" FROM "practice_progress_resets" ORDER BY "user_id", "reset_at" DESC, "id" DESC;
