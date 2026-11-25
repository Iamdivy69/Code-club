ALTER TYPE "PracticePublicationKind" ADD VALUE 'REPORT';
ALTER TABLE "practice_publications" ADD COLUMN "payload" JSONB, ADD COLUMN "review_reason" VARCHAR(1000);
ALTER TABLE "practice_submissions" ADD COLUMN "progress_eligible" BOOLEAN NOT NULL DEFAULT true;
CREATE TABLE "practice_edition_missions" ("id" VARCHAR(60) PRIMARY KEY, "problem_id" UUID NOT NULL REFERENCES "problems"("id") ON DELETE RESTRICT ON UPDATE CASCADE);
