ALTER TABLE "practice_profiles"
  ADD COLUMN "available_for_work" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "preferred_role" VARCHAR(60),
  ADD COLUMN "expected_graduation" INTEGER;

ALTER TABLE "practice_profiles" ADD CONSTRAINT "practice_profile_graduation_year"
  CHECK ("expected_graduation" IS NULL OR "expected_graduation" BETWEEN 1900 AND 2200);

CREATE INDEX "practice_profiles_discovery_handle_idx" ON "practice_profiles"("handle")
  WHERE "is_public" AND "hiring_open";
