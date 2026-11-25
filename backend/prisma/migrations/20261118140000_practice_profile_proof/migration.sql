CREATE TABLE "practice_profile_proofs" (
  "id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "handle" VARCHAR(32) NOT NULL,
  "signed_at" TIMESTAMPTZ(3) NOT NULL,
  "easy" INTEGER NOT NULL,
  "medium" INTEGER NOT NULL,
  "hard" INTEGER NOT NULL,
  "digest" VARCHAR(64) NOT NULL,
  CONSTRAINT "practice_profile_proofs_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "practice_profile_proofs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "practice_profiles"("user_id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "practice_profile_proofs_user_id_key" ON "practice_profile_proofs"("user_id");
