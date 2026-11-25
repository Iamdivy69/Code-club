CREATE TYPE "PracticeReflectionRating" AS ENUM ('easy', 'manageable', 'challenging', 'reallyDifficult');

ALTER TABLE "practice_submissions"
  ADD COLUMN "reflection_rating" "PracticeReflectionRating",
  ADD COLUMN "reflected_at" TIMESTAMPTZ(3),
  ADD CONSTRAINT "practice_submission_reflection_accepted"
    CHECK (
      ("reflection_rating" IS NULL AND "reflected_at" IS NULL)
      OR ("reflection_rating" IS NOT NULL AND "reflected_at" IS NOT NULL AND "verdict" = 'ACCEPTED')
    );
