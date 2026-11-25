CREATE INDEX "practice_submissions_user_activity_idx"
  ON "practice_submissions"("user_id", "created_at", "id");
