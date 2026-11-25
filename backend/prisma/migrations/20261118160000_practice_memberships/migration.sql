CREATE TYPE "PracticeMembershipPlan" AS ENUM ('pro_monthly', 'pro_yearly', 'founding_lifetime', 'lifetime');

CREATE TABLE "practice_membership_grants" (
  "id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "plan" "PracticeMembershipPlan" NOT NULL,
  "granted_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expires_at" TIMESTAMPTZ(3),
  "issued_by_id" UUID,
  "reason" VARCHAR(280) NOT NULL,
  "revoked_at" TIMESTAMPTZ(3),
  "revoked_by_id" UUID,
  "revocation_reason" VARCHAR(280),
  CONSTRAINT "practice_membership_grants_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "practice_membership_grants_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "practice_membership_grants_issued_by_id_fkey" FOREIGN KEY ("issued_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "practice_membership_grants_revoked_by_id_fkey" FOREIGN KEY ("revoked_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "practice_membership_grants_user_id_granted_at_idx" ON "practice_membership_grants"("user_id", "granted_at");

CREATE TABLE "practice_profile_downloads" (
  "user_id" UUID NOT NULL,
  "month" VARCHAR(7) NOT NULL,
  "request_key" UUID NOT NULL,
  "snapshot" JSONB NOT NULL,
  CONSTRAINT "practice_profile_downloads_pkey" PRIMARY KEY ("user_id"),
  CONSTRAINT "practice_profile_downloads_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
