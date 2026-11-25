-- Expand: add hashed refresh-token lookup for rotating refresh (nullable for zero-downtime backfill)
ALTER TABLE "sessions" ADD COLUMN "refresh_token_hash" TEXT;

-- Unique index on hash; NULLs are distinct in Postgres so legacy rows stay valid until backfilled
CREATE UNIQUE INDEX "sessions_refresh_token_hash_key" ON "sessions"("refresh_token_hash");
