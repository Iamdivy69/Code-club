CREATE TABLE "practice_weekly_reviews" (
    "user_id" UUID NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "period" DATE,
    "lease_token" UUID,
    "lease_until" TIMESTAMPTZ(3),
    "dispatch_at" TIMESTAMPTZ(3),
    "last_sent_at" TIMESTAMPTZ(3),
    CONSTRAINT "practice_weekly_reviews_pkey" PRIMARY KEY ("user_id"),
    CONSTRAINT "practice_weekly_reviews_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "practice_weekly_reviews_enabled_user_idx" ON "practice_weekly_reviews"("enabled", "user_id");
