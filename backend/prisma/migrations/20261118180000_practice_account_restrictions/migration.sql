CREATE TABLE "practice_account_restrictions" (
    "user_id" UUID NOT NULL,
    "suspended_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "practice_account_restrictions_pkey" PRIMARY KEY ("user_id"),
    CONSTRAINT "practice_account_restrictions_user_id_fkey"
      FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
