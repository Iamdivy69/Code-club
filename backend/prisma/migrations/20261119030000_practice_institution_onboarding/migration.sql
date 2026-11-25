CREATE TYPE "PracticeInstitutionStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'REVOKED');

CREATE TABLE "practice_institution_applications" (
    "id" UUID PRIMARY KEY,
    "applicant_id" UUID REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE,
    "submitted_email" VARCHAR(254) NOT NULL,
    "domain" VARCHAR(253) NOT NULL,
    "name" VARCHAR(150) NOT NULL,
    "evidence" VARCHAR(1000) NOT NULL,
    "status" "PracticeInstitutionStatus" NOT NULL DEFAULT 'PENDING',
    "university_id" UUID REFERENCES "universities"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "reason" VARCHAR(1000),
    "submitted_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewed_at" TIMESTAMPTZ(3),
    "reviewed_by" UUID REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE,
    "version" INTEGER NOT NULL DEFAULT 1 CHECK ("version" >= 1),
    CHECK ("domain" = lower(trim("domain")) AND "domain" <> ''),
    CHECK (("status" = 'PENDING') = ("reviewed_at" IS NULL)),
    CHECK (("status" IN ('APPROVED', 'REVOKED')) = ("university_id" IS NOT NULL)),
    CHECK ("status" NOT IN ('REJECTED', 'REVOKED') OR length(trim(coalesce("reason", ''))) > 0)
);

CREATE UNIQUE INDEX "practice_institution_one_live_domain" ON "practice_institution_applications"("domain")
    WHERE "status" IN ('PENDING', 'APPROVED');
CREATE INDEX "practice_institution_applicant_history_idx" ON "practice_institution_applications"("applicant_id", "submitted_at");
CREATE INDEX "practice_institution_domain_history_idx" ON "practice_institution_applications"("domain", "submitted_at");
CREATE INDEX "practice_institution_review_queue_idx" ON "practice_institution_applications"("status", "submitted_at", "id");
CREATE INDEX "practice_institution_university_idx" ON "practice_institution_applications"("university_id");
CREATE INDEX "practice_institution_reviewer_idx" ON "practice_institution_applications"("reviewed_by");
