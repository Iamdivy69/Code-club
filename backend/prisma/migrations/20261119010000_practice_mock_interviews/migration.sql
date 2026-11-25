CREATE TABLE "practice_mock_interviews" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "problem_id" UUID,
    "request_key" UUID NOT NULL,
    "problem" JSONB NOT NULL,
    "started_at" TIMESTAMPTZ(3) NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "ended_at" TIMESTAMPTZ(3),
    "turn_count" INTEGER NOT NULL DEFAULT 0,
    "lease_token" UUID,
    "lease_until" TIMESTAMPTZ(3),
    CONSTRAINT "practice_mock_interviews_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "practice_mock_interviews_user_id_fkey" FOREIGN KEY ("user_id")
      REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "practice_mock_interviews_problem_id_fkey" FOREIGN KEY ("problem_id")
      REFERENCES "problems"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "practice_mock_interviews_user_id_request_key_key"
    ON "practice_mock_interviews"("user_id", "request_key");
CREATE INDEX "practice_mock_interviews_user_id_started_at_id_idx"
    ON "practice_mock_interviews"("user_id", "started_at", "id");
CREATE INDEX "practice_mock_interviews_problem_id_idx" ON "practice_mock_interviews"("problem_id");

CREATE TABLE "practice_mock_interview_turns" (
    "interview_id" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "request_key" UUID NOT NULL,
    "input_digest" CHAR(64) NOT NULL,
    "answer" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "practice_mock_interview_turns_pkey" PRIMARY KEY ("interview_id", "position"),
    CONSTRAINT "practice_mock_interview_turns_interview_id_fkey" FOREIGN KEY ("interview_id")
      REFERENCES "practice_mock_interviews"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "practice_mock_interview_turns_interview_id_request_key_key"
    ON "practice_mock_interview_turns"("interview_id", "request_key");
