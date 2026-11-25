-- Drop the plaintext refresh_token column from sessions (SEC-005).
--
-- FAIL-CLOSED GUARD: if any sessions still have no hash (the backfill script
-- was not run first), abort the migration instead of silently logging those
-- users out. Run `npx tsx scripts/backfill-refresh-hash.ts` against this
-- database, confirm 0 unhashed rows, then re-run `prisma migrate deploy`.

DO $$
DECLARE
  unhashed_count integer;
BEGIN
  SELECT count(*) INTO unhashed_count FROM "sessions" WHERE "refresh_token_hash" IS NULL;
  IF unhashed_count > 0 THEN
    RAISE EXCEPTION
      'SEC-005 migration blocked: % session(s) have no refresh_token_hash. '
      'Run `npx tsx scripts/backfill-refresh-hash.ts` with this DATABASE_URL first, '
      'then re-run `prisma migrate deploy`. (Unverified plaintext sessions would '
      'otherwise be silently deleted, logging out those users.)', unhashed_count;
  END IF;
END
$$;

DROP INDEX IF EXISTS "sessions_refresh_token_idx";
DROP INDEX IF EXISTS "sessions_refresh_token_key";

ALTER TABLE "sessions" DROP COLUMN IF EXISTS "refresh_token";
ALTER TABLE "sessions" ALTER COLUMN "refresh_token_hash" SET NOT NULL;
