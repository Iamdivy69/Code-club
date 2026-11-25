-- CreateEnum
CREATE TYPE "PracticeReviewStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "practice_assignments" (
    "id" UUID NOT NULL,
    "class_id" UUID NOT NULL,
    "title" VARCHAR(100) NOT NULL,
    "problem_ids" UUID[],
    "starts_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "due_at" TIMESTAMPTZ(3) NOT NULL,
    "archived" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "practice_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "practice_recruiters" (
    "user_id" UUID NOT NULL,
    "company" VARCHAR(100) NOT NULL,
    "work_email" VARCHAR(254) NOT NULL,
    "status" "PracticeReviewStatus" NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewed_at" TIMESTAMPTZ(3),

    CONSTRAINT "practice_recruiters_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "practice_recruiter_interests" (
    "recruiter_id" UUID NOT NULL,
    "candidate_id" UUID NOT NULL,
    "message" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "practice_recruiter_interests_pkey" PRIMARY KEY ("recruiter_id","candidate_id")
);

-- CreateTable
CREATE TABLE "practice_assessments" (
    "id" UUID NOT NULL,
    "recruiter_id" UUID NOT NULL,
    "candidate_id" UUID NOT NULL,
    "title" VARCHAR(100) NOT NULL,
    "duration_minutes" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "started_at" TIMESTAMPTZ(3),
    "finished_at" TIMESTAMPTZ(3),

    CONSTRAINT "practice_assessments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "practice_assessment_problems" (
    "assessment_id" UUID NOT NULL,
    "problem_id" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "version" INTEGER NOT NULL,

    CONSTRAINT "practice_assessment_problems_pkey" PRIMARY KEY ("assessment_id","problem_id")
);

-- CreateTable
CREATE TABLE "practice_assessment_solves" (
    "assessment_id" UUID NOT NULL,
    "problem_id" UUID NOT NULL,
    "submission_id" UUID NOT NULL,

    CONSTRAINT "practice_assessment_solves_pkey" PRIMARY KEY ("assessment_id","problem_id")
);

-- CreateIndex
CREATE INDEX "practice_assignments_class_id_due_at_idx" ON "practice_assignments"("class_id", "due_at");

-- CreateIndex
CREATE INDEX "practice_recruiters_status_idx" ON "practice_recruiters"("status");

-- CreateIndex
CREATE INDEX "practice_recruiter_interests_candidate_id_idx" ON "practice_recruiter_interests"("candidate_id");

-- CreateIndex
CREATE INDEX "practice_assessments_recruiter_id_idx" ON "practice_assessments"("recruiter_id");

-- CreateIndex
CREATE INDEX "practice_assessments_candidate_id_idx" ON "practice_assessments"("candidate_id");

-- CreateIndex
CREATE INDEX "practice_assessment_problems_problem_id_idx" ON "practice_assessment_problems"("problem_id");

-- CreateIndex
CREATE UNIQUE INDEX "practice_assessment_problems_assessment_id_position_key" ON "practice_assessment_problems"("assessment_id", "position");

-- CreateIndex
CREATE UNIQUE INDEX "practice_assessment_solves_submission_id_key" ON "practice_assessment_solves"("submission_id");

-- AddForeignKey
ALTER TABLE "practice_assignments" ADD CONSTRAINT "practice_assignments_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "classes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "practice_recruiters" ADD CONSTRAINT "practice_recruiters_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "practice_recruiter_interests" ADD CONSTRAINT "practice_recruiter_interests_recruiter_id_fkey" FOREIGN KEY ("recruiter_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "practice_recruiter_interests" ADD CONSTRAINT "practice_recruiter_interests_candidate_id_fkey" FOREIGN KEY ("candidate_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "practice_assessments" ADD CONSTRAINT "practice_assessments_recruiter_id_fkey" FOREIGN KEY ("recruiter_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "practice_assessments" ADD CONSTRAINT "practice_assessments_candidate_id_fkey" FOREIGN KEY ("candidate_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "practice_assessment_problems" ADD CONSTRAINT "practice_assessment_problems_assessment_id_fkey" FOREIGN KEY ("assessment_id") REFERENCES "practice_assessments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "practice_assessment_problems" ADD CONSTRAINT "practice_assessment_problems_problem_id_fkey" FOREIGN KEY ("problem_id") REFERENCES "problems"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "practice_assessment_solves" ADD CONSTRAINT "practice_assessment_solves_assessment_id_fkey" FOREIGN KEY ("assessment_id") REFERENCES "practice_assessments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "practice_assessment_solves" ADD CONSTRAINT "practice_assessment_solves_submission_id_fkey" FOREIGN KEY ("submission_id") REFERENCES "practice_submissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

