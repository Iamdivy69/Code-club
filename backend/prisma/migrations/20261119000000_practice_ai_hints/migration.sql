CREATE TABLE "practice_hint_cache" (
    "problem_id" UUID NOT NULL,
    "context_key" CHAR(64) NOT NULL,
    "level" INTEGER NOT NULL CHECK ("level" BETWEEN 1 AND 3),
    "hint" TEXT,
    "expires_at" TIMESTAMPTZ(3),
    "lease_token" UUID,
    "lease_until" TIMESTAMPTZ(3),
    CONSTRAINT "practice_hint_cache_pkey" PRIMARY KEY ("problem_id", "context_key", "level"),
    CONSTRAINT "practice_hint_cache_problem_id_fkey" FOREIGN KEY ("problem_id")
      REFERENCES "practice_problem_contracts"("problem_id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "practice_hint_allowances" (
    "user_id" UUID NOT NULL,
    "day" VARCHAR(10) NOT NULL,
    "used" INTEGER NOT NULL CHECK ("used" BETWEEN 0 AND 3),
    CONSTRAINT "practice_hint_allowances_pkey" PRIMARY KEY ("user_id", "day"),
    CONSTRAINT "practice_hint_allowances_user_id_fkey" FOREIGN KEY ("user_id")
      REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
