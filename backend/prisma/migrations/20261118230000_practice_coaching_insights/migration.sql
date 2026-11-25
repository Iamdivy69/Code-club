CREATE TABLE "practice_coaching_insights" (
    "user_id" UUID NOT NULL,
    "insights" JSONB,
    "generated_at" TIMESTAMPTZ(3),
    "retry_at" TIMESTAMPTZ(3),
    "lease_token" UUID,
    "lease_until" TIMESTAMPTZ(3),
    CONSTRAINT "practice_coaching_insights_pkey" PRIMARY KEY ("user_id"),
    CONSTRAINT "practice_coaching_insights_user_id_fkey"
      FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
