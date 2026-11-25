ALTER TABLE "practice_opportunities"
  ADD COLUMN "source_url" TEXT,
  ADD COLUMN "import_fingerprint" TEXT,
  ADD COLUMN "verified_at" TIMESTAMPTZ(3),
  ADD CONSTRAINT "practice_opportunity_import_review"
    CHECK ("import_fingerprint" IS NULL OR ("source_url" IS NOT NULL AND (NOT "published" OR "verified_at" IS NOT NULL)));

CREATE UNIQUE INDEX "practice_opportunities_import_fingerprint_key"
  ON "practice_opportunities"("import_fingerprint");
