BEGIN;

ALTER TABLE "practice_recruiter_interests"
  ADD COLUMN "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  ADD COLUMN "candidate_handle" VARCHAR(32);

ALTER TABLE "practice_recruiter_interests"
  ALTER COLUMN "id" DROP DEFAULT,
  DROP CONSTRAINT "practice_recruiter_interests_pkey",
  ADD CONSTRAINT "practice_recruiter_interests_pkey" PRIMARY KEY ("id");

DROP INDEX "practice_recruiter_interests_candidate_id_idx";
CREATE INDEX "practice_interest_candidate_recent_idx"
  ON "practice_recruiter_interests"("candidate_id", "created_at" DESC, "id" DESC);
CREATE INDEX "practice_interest_recruiter_recent_idx"
  ON "practice_recruiter_interests"("recruiter_id", "created_at" DESC, "id" DESC);
CREATE INDEX "practice_interest_pair_recent_idx"
  ON "practice_recruiter_interests"("recruiter_id", "candidate_id", "created_at" DESC, "id" DESC);

COMMIT;
