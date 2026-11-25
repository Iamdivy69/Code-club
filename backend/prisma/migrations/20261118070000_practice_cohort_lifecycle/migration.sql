CREATE TABLE "practice_cohort_archives" (
    "class_id" UUID PRIMARY KEY,
    "archived_by" UUID,
    "archived_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "practice_cohort_archives_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "classes"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "practice_cohort_archives_archived_by_fkey" FOREIGN KEY ("archived_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "practice_cohort_archives_archived_by_idx" ON "practice_cohort_archives"("archived_by");

CREATE TABLE "practice_cohort_invites" (
    "class_id" UUID NOT NULL,
    "email" VARCHAR(254) NOT NULL,
    "invited_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "practice_cohort_invites_pkey" PRIMARY KEY ("class_id", "email"),
    CONSTRAINT "practice_cohort_invites_normalized_email" CHECK ("email" = LOWER(TRIM("email")) AND LENGTH("email") >= 3),
    CONSTRAINT "practice_cohort_invites_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "classes"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "practice_cohort_invites_invited_by_fkey" FOREIGN KEY ("invited_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "practice_cohort_invites_email_idx" ON "practice_cohort_invites"("email");
CREATE INDEX "practice_cohort_invites_invited_by_idx" ON "practice_cohort_invites"("invited_by");
