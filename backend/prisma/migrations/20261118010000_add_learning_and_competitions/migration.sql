-- CreateEnum
CREATE TYPE "PracticeCompetitionKind" AS ENUM ('CONTEST', 'BATTLE');

-- AlterTable
ALTER TABLE "practice_problem_contracts" ADD COLUMN     "design_contract" JSONB,
ADD COLUMN     "editorial" TEXT,
ADD COLUMN     "native_signature" JSONB;

-- CreateTable
CREATE TABLE "practice_study_items" (
    "user_id" UUID NOT NULL,
    "problem_id" UUID NOT NULL,
    "saved" BOOLEAN NOT NULL DEFAULT false,
    "note" TEXT NOT NULL DEFAULT '',
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "practice_study_items_pkey" PRIMARY KEY ("user_id","problem_id")
);

-- CreateTable
CREATE TABLE "practice_profiles" (
    "user_id" UUID NOT NULL,
    "handle" VARCHAR(32) NOT NULL,
    "bio" TEXT NOT NULL DEFAULT '',
    "is_public" BOOLEAN NOT NULL DEFAULT false,
    "hiring_open" BOOLEAN NOT NULL DEFAULT false,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "practice_profiles_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "practice_playlists" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "problem_ids" UUID[],
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "practice_playlists_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "practice_daily_challenges" (
    "day" VARCHAR(10) NOT NULL,
    "problem_id" UUID NOT NULL,

    CONSTRAINT "practice_daily_challenges_pkey" PRIMARY KEY ("day")
);

-- CreateTable
CREATE TABLE "practice_quiz_attempts" (
    "user_id" UUID NOT NULL,
    "day" VARCHAR(10) NOT NULL,
    "score" INTEGER NOT NULL,
    "total" INTEGER NOT NULL,
    "completed_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "practice_quiz_attempts_pkey" PRIMARY KEY ("user_id","day")
);

-- CreateTable
CREATE TABLE "practice_certificates" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "track" VARCHAR(50) NOT NULL,
    "issuer_name" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "practice_certificates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "practice_competitions" (
    "id" UUID NOT NULL,
    "host_id" UUID NOT NULL,
    "title" VARCHAR(100) NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "kind" "PracticeCompetitionKind" NOT NULL DEFAULT 'CONTEST',
    "is_private" BOOLEAN NOT NULL DEFAULT false,
    "join_code" TEXT,
    "starts_at" TIMESTAMPTZ(3) NOT NULL,
    "ends_at" TIMESTAMPTZ(3) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "practice_competitions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "practice_competition_problems" (
    "competition_id" UUID NOT NULL,
    "problem_id" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "version" INTEGER NOT NULL,

    CONSTRAINT "practice_competition_problems_pkey" PRIMARY KEY ("competition_id","problem_id")
);

-- CreateTable
CREATE TABLE "practice_competition_players" (
    "competition_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "joined_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "display_name" VARCHAR(50) NOT NULL,
    "team" INTEGER,

    CONSTRAINT "practice_competition_players_pkey" PRIMARY KEY ("competition_id","user_id")
);

-- CreateTable
CREATE TABLE "practice_competition_solves" (
    "competition_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "problem_id" UUID NOT NULL,
    "submission_id" UUID NOT NULL,
    "points" INTEGER NOT NULL,
    "solved_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "practice_competition_solves_pkey" PRIMARY KEY ("competition_id","user_id","problem_id")
);

-- CreateIndex
CREATE INDEX "practice_study_items_problem_id_idx" ON "practice_study_items"("problem_id");

-- CreateIndex
CREATE UNIQUE INDEX "practice_profiles_handle_key" ON "practice_profiles"("handle");

-- CreateIndex
CREATE INDEX "practice_playlists_user_id_idx" ON "practice_playlists"("user_id");

-- CreateIndex
CREATE INDEX "practice_daily_challenges_problem_id_idx" ON "practice_daily_challenges"("problem_id");

-- CreateIndex
CREATE UNIQUE INDEX "practice_certificates_user_id_track_key" ON "practice_certificates"("user_id", "track");

-- CreateIndex
CREATE UNIQUE INDEX "practice_competitions_join_code_key" ON "practice_competitions"("join_code");

-- CreateIndex
CREATE INDEX "practice_competitions_host_id_idx" ON "practice_competitions"("host_id");

-- CreateIndex
CREATE INDEX "practice_competitions_is_private_ends_at_idx" ON "practice_competitions"("is_private", "ends_at");

-- CreateIndex
CREATE INDEX "practice_competition_problems_problem_id_idx" ON "practice_competition_problems"("problem_id");

-- CreateIndex
CREATE UNIQUE INDEX "practice_competition_problems_competition_id_position_key" ON "practice_competition_problems"("competition_id", "position");

-- CreateIndex
CREATE INDEX "practice_competition_players_user_id_idx" ON "practice_competition_players"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "practice_competition_solves_submission_id_key" ON "practice_competition_solves"("submission_id");

-- CreateIndex
CREATE INDEX "practice_competition_solves_problem_id_idx" ON "practice_competition_solves"("problem_id");

-- AddForeignKey
ALTER TABLE "practice_study_items" ADD CONSTRAINT "practice_study_items_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "practice_study_items" ADD CONSTRAINT "practice_study_items_problem_id_fkey" FOREIGN KEY ("problem_id") REFERENCES "problems"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "practice_profiles" ADD CONSTRAINT "practice_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "practice_playlists" ADD CONSTRAINT "practice_playlists_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "practice_daily_challenges" ADD CONSTRAINT "practice_daily_challenges_problem_id_fkey" FOREIGN KEY ("problem_id") REFERENCES "problems"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "practice_quiz_attempts" ADD CONSTRAINT "practice_quiz_attempts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "practice_certificates" ADD CONSTRAINT "practice_certificates_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "practice_competitions" ADD CONSTRAINT "practice_competitions_host_id_fkey" FOREIGN KEY ("host_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "practice_competition_problems" ADD CONSTRAINT "practice_competition_problems_competition_id_fkey" FOREIGN KEY ("competition_id") REFERENCES "practice_competitions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "practice_competition_problems" ADD CONSTRAINT "practice_competition_problems_problem_id_fkey" FOREIGN KEY ("problem_id") REFERENCES "problems"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "practice_competition_players" ADD CONSTRAINT "practice_competition_players_competition_id_fkey" FOREIGN KEY ("competition_id") REFERENCES "practice_competitions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "practice_competition_players" ADD CONSTRAINT "practice_competition_players_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "practice_competition_solves" ADD CONSTRAINT "practice_competition_solves_competition_id_user_id_fkey" FOREIGN KEY ("competition_id", "user_id") REFERENCES "practice_competition_players"("competition_id", "user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "practice_competition_solves" ADD CONSTRAINT "practice_competition_solves_submission_id_fkey" FOREIGN KEY ("submission_id") REFERENCES "practice_submissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "practice_competition_solves" ADD CONSTRAINT "practice_competition_solves_problem_id_fkey" FOREIGN KEY ("problem_id") REFERENCES "problems"("id") ON DELETE CASCADE ON UPDATE CASCADE;

