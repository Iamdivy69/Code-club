CREATE TYPE "PracticeExternalStatsSource" AS ENUM ('manual', 'fetched');

CREATE TABLE "practice_external_stats" (
    "user_id" UUID PRIMARY KEY REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    "revision" UUID NOT NULL,
    "username" VARCHAR(50),
    "source" "PracticeExternalStatsSource",
    "easy" INTEGER NOT NULL CHECK ("easy" BETWEEN 0 AND 5000),
    "medium" INTEGER NOT NULL CHECK ("medium" BETWEEN 0 AND 5000),
    "hard" INTEGER NOT NULL CHECK ("hard" BETWEEN 0 AND 5000),
    "recorded_at" TIMESTAMPTZ(3),
    CHECK (
      ("username" IS NOT NULL AND "source" IS NOT NULL AND "recorded_at" IS NOT NULL)
      OR ("username" IS NULL AND "source" IS NULL AND "recorded_at" IS NULL AND "easy" = 0 AND "medium" = 0 AND "hard" = 0)
    )
);
