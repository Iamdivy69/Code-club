CREATE TABLE "practice_officer_applications" (
    "id" UUID PRIMARY KEY,
    "applicant_id" UUID NOT NULL REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    "university_id" UUID NOT NULL REFERENCES "universities"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    "submitted_email" VARCHAR(254) NOT NULL,
    "status" "PracticeReviewStatus" NOT NULL DEFAULT 'PENDING',
    "evidence" JSONB NOT NULL DEFAULT '[]',
    "version" INTEGER NOT NULL DEFAULT 1 CHECK ("version" >= 1),
    "submitted_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewed_at" TIMESTAMPTZ(3),
    "reviewed_by" UUID REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE,
    "reason" VARCHAR(1000),
    CHECK (jsonb_typeof("evidence") = 'array' AND jsonb_array_length("evidence") <= 10),
    CHECK (("status" = 'PENDING') = ("reviewed_at" IS NULL)),
    CHECK ("status" <> 'REJECTED' OR length(trim(coalesce("reason", ''))) > 0)
);
CREATE UNIQUE INDEX "practice_officer_one_pending" ON "practice_officer_applications"("applicant_id", "university_id") WHERE "status" = 'PENDING';
CREATE INDEX "practice_officer_applicant_history_idx" ON "practice_officer_applications"("applicant_id", "university_id", "submitted_at");
CREATE INDEX "practice_officer_applications_status_submitted_at_id_idx" ON "practice_officer_applications"("status", "submitted_at", "id");
CREATE INDEX "practice_officer_applications_university_id_idx" ON "practice_officer_applications"("university_id");
CREATE INDEX "practice_officer_applications_reviewed_by_idx" ON "practice_officer_applications"("reviewed_by");
