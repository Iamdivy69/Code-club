ALTER TYPE "PracticeMembershipPlan" ADD VALUE 'ambassador_reward';

ALTER TABLE "practice_publications"
  ADD COLUMN "ambassador_college_name" VARCHAR(200),
  ADD COLUMN "ambassador_college_domain" VARCHAR(253),
  ADD COLUMN "ambassador_rejection_reason" VARCHAR(500);

CREATE TABLE "practice_ambassador_claims" (
  "user_id" UUID NOT NULL,
  "milestone_id" VARCHAR(24) NOT NULL,
  "reward_days" INTEGER NOT NULL CHECK ("reward_days" > 0),
  "claimed_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "grant_id" UUID,
  "activated_at" TIMESTAMPTZ(3),
  CONSTRAINT "practice_ambassador_claims_pkey" PRIMARY KEY ("user_id", "milestone_id"),
  CONSTRAINT "practice_ambassador_claims_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT "practice_ambassador_claims_grant_id_fkey"
    FOREIGN KEY ("grant_id") REFERENCES "practice_membership_grants"("id") ON UPDATE CASCADE ON DELETE SET NULL
);

CREATE INDEX "practice_ambassador_claims_grant_id_idx" ON "practice_ambassador_claims"("grant_id");
