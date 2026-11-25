ALTER TABLE "practice_submissions" ADD COLUMN "progress_epoch" UUID;
UPDATE "practice_submissions" submission SET "progress_epoch" = epoch."reset_id"
FROM "practice_progress_epochs" epoch WHERE submission."user_id" = epoch."user_id" AND submission."progress_eligible" AND submission."created_at" > epoch."reset_at";
