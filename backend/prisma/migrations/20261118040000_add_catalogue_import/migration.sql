CREATE TABLE "practice_catalogue_entries" (
    "problem_id" UUID NOT NULL,
    "source" VARCHAR(100) NOT NULL,
    "source_id" VARCHAR(100) NOT NULL,
    "source_slug" VARCHAR(200) NOT NULL,
    "source_version" VARCHAR(120) NOT NULL,
    "source_digest" CHAR(64) NOT NULL,
    "content_digest" CHAR(64) NOT NULL,
    "mapped_legacy" BOOLEAN NOT NULL DEFAULT false,
    "visualizer_path" VARCHAR(250),
    "review" JSONB NOT NULL,
    "display" JSONB NOT NULL,

    CONSTRAINT "practice_catalogue_entries_pkey" PRIMARY KEY ("problem_id")
);

CREATE UNIQUE INDEX "practice_catalogue_entries_source_source_id_key"
ON "practice_catalogue_entries"("source", "source_id");

ALTER TABLE "practice_catalogue_entries"
ADD CONSTRAINT "practice_catalogue_entries_problem_id_fkey"
FOREIGN KEY ("problem_id") REFERENCES "practice_problem_contracts"("problem_id")
ON DELETE CASCADE ON UPDATE CASCADE;

