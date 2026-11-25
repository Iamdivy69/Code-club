-- CreateEnum
CREATE TYPE "PracticeComparison" AS ENUM ('EXACT', 'UNORDERED');

-- CreateEnum
CREATE TYPE "PracticeVerdict" AS ENUM ('ACCEPTED', 'WRONG_ANSWER', 'COMPILATION_ERROR', 'RUNTIME_ERROR', 'TIME_LIMIT_EXCEEDED');

-- CreateTable
CREATE TABLE "practice_problem_contracts" (
    "problem_id" UUID NOT NULL,
    "function_name" TEXT NOT NULL,
    "parameter_order" TEXT[],
    "content_version" INTEGER NOT NULL DEFAULT 1,
    "comparison_mode" "PracticeComparison" NOT NULL DEFAULT 'EXACT',
    "hidden_set_enabled" BOOLEAN NOT NULL DEFAULT true,
    "enabled" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "practice_problem_contracts_pkey" PRIMARY KEY ("problem_id")
);

-- CreateTable
CREATE TABLE "practice_test_cases" (
    "id" UUID NOT NULL,
    "problem_id" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "hidden" BOOLEAN NOT NULL,
    "input_json" TEXT NOT NULL,
    "expected_output_json" TEXT NOT NULL,

    CONSTRAINT "practice_test_cases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "practice_submissions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "problem_id" UUID NOT NULL,
    "problem_version" INTEGER NOT NULL,
    "language" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "verdict" "PracticeVerdict" NOT NULL,
    "passed" INTEGER NOT NULL,
    "total" INTEGER NOT NULL,
    "visible_passed" INTEGER NOT NULL,
    "hidden_passed" INTEGER NOT NULL,
    "runtime_ms" INTEGER,
    "memory_kb" INTEGER,
    "diagnostic" TEXT,
    "request_key" UUID NOT NULL,
    "request_digest" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "practice_submissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "practice_progress" (
    "user_id" UUID NOT NULL,
    "problem_id" UUID NOT NULL,
    "status" "ProgressStatus" NOT NULL,
    "attempt_count" INTEGER NOT NULL DEFAULT 0,
    "accepted_count" INTEGER NOT NULL DEFAULT 0,
    "first_solved_at" TIMESTAMPTZ(3),
    "last_attempt_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "practice_progress_pkey" PRIMARY KEY ("user_id","problem_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "practice_test_cases_problem_id_hidden_position_key" ON "practice_test_cases"("problem_id", "hidden", "position");

-- CreateIndex
CREATE INDEX "practice_submissions_user_id_problem_id_created_at_id_idx" ON "practice_submissions"("user_id", "problem_id", "created_at", "id");

-- CreateIndex
CREATE INDEX "practice_submissions_problem_id_verdict_idx" ON "practice_submissions"("problem_id", "verdict");

-- CreateIndex
CREATE UNIQUE INDEX "practice_submissions_user_id_request_key_key" ON "practice_submissions"("user_id", "request_key");

-- CreateIndex
CREATE INDEX "practice_progress_problem_id_idx" ON "practice_progress"("problem_id");

-- AddForeignKey
ALTER TABLE "practice_problem_contracts" ADD CONSTRAINT "practice_problem_contracts_problem_id_fkey" FOREIGN KEY ("problem_id") REFERENCES "problems"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "practice_test_cases" ADD CONSTRAINT "practice_test_cases_problem_id_fkey" FOREIGN KEY ("problem_id") REFERENCES "practice_problem_contracts"("problem_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "practice_submissions" ADD CONSTRAINT "practice_submissions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "practice_submissions" ADD CONSTRAINT "practice_submissions_problem_id_fkey" FOREIGN KEY ("problem_id") REFERENCES "problems"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "practice_progress" ADD CONSTRAINT "practice_progress_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "practice_progress" ADD CONSTRAINT "practice_progress_problem_id_fkey" FOREIGN KEY ("problem_id") REFERENCES "problems"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Retain the invariants of a committed server verdict.
ALTER TABLE "practice_problem_contracts" ADD CONSTRAINT "practice_problem_contracts_content_version_check"
  CHECK ("content_version" > 0);
ALTER TABLE "practice_test_cases" ADD CONSTRAINT "practice_test_cases_position_check" CHECK ("position" >= 0);
ALTER TABLE "practice_submissions" ADD CONSTRAINT "practice_submissions_counts_check"
  CHECK ("total" > 0 AND "passed" BETWEEN 0 AND "total" AND "visible_passed" >= 0 AND "hidden_passed" >= 0
    AND "passed" = "visible_passed" + "hidden_passed");
ALTER TABLE "practice_progress" ADD CONSTRAINT "practice_progress_counts_check"
  CHECK ("attempt_count" >= 0 AND "accepted_count" BETWEEN 0 AND "attempt_count");
