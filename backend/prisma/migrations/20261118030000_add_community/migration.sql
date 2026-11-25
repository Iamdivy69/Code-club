-- CreateEnum
CREATE TYPE "PracticePublicationKind" AS ENUM ('FEATURE', 'CONTRIBUTION', 'AMBASSADOR');

-- CreateEnum
CREATE TYPE "PracticePublicationState" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'SHIPPED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "PracticeRedemptionState" AS ENUM ('PENDING', 'FULFILLED', 'CANCELLED');

-- CreateTable
CREATE TABLE "practice_publications" (
    "id" UUID NOT NULL,
    "author_id" UUID NOT NULL,
    "kind" "PracticePublicationKind" NOT NULL,
    "state" "PracticePublicationState" NOT NULL DEFAULT 'PENDING',
    "title" VARCHAR(120) NOT NULL,
    "body" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewed_at" TIMESTAMPTZ(3),

    CONSTRAINT "practice_publications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "practice_publication_votes" (
    "publication_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,

    CONSTRAINT "practice_publication_votes_pkey" PRIMARY KEY ("publication_id","user_id")
);

-- CreateTable
CREATE TABLE "practice_opportunities" (
    "id" UUID NOT NULL,
    "title" VARCHAR(120) NOT NULL,
    "company" VARCHAR(100) NOT NULL,
    "category" VARCHAR(32) NOT NULL,
    "remote" BOOLEAN NOT NULL DEFAULT false,
    "summary" TEXT NOT NULL,
    "apply_url" TEXT NOT NULL,
    "closes_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "published" BOOLEAN NOT NULL DEFAULT false,
    "clicks" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "practice_opportunities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "practice_referrals" (
    "referred_id" UUID NOT NULL,
    "referrer_id" UUID NOT NULL,
    "qualified_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "practice_referrals_pkey" PRIMARY KEY ("referred_id")
);

-- CreateTable
CREATE TABLE "practice_credits" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "event_key" TEXT NOT NULL,
    "reason" VARCHAR(60) NOT NULL,
    "amount" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "practice_credits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "practice_rewards" (
    "id" UUID NOT NULL,
    "title" VARCHAR(120) NOT NULL,
    "details" TEXT NOT NULL,
    "cost" INTEGER NOT NULL,
    "stock" INTEGER NOT NULL,
    "available" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "practice_rewards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "practice_redemptions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "reward_id" UUID NOT NULL,
    "cost" INTEGER NOT NULL,
    "request_key" UUID NOT NULL,
    "state" "PracticeRedemptionState" NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "practice_redemptions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "practice_publications_kind_state_created_at_idx" ON "practice_publications"("kind", "state", "created_at");

-- CreateIndex
CREATE INDEX "practice_publications_author_id_idx" ON "practice_publications"("author_id");

-- CreateIndex
CREATE INDEX "practice_publication_votes_user_id_idx" ON "practice_publication_votes"("user_id");

-- CreateIndex
CREATE INDEX "practice_opportunities_published_closes_at_idx" ON "practice_opportunities"("published", "closes_at");

-- CreateIndex
CREATE INDEX "practice_referrals_referrer_id_idx" ON "practice_referrals"("referrer_id");

-- CreateIndex
CREATE UNIQUE INDEX "practice_credits_event_key_key" ON "practice_credits"("event_key");

-- CreateIndex
CREATE INDEX "practice_credits_user_id_created_at_idx" ON "practice_credits"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "practice_redemptions_user_id_created_at_idx" ON "practice_redemptions"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "practice_redemptions_reward_id_idx" ON "practice_redemptions"("reward_id");

-- CreateIndex
CREATE UNIQUE INDEX "practice_redemptions_user_id_request_key_key" ON "practice_redemptions"("user_id", "request_key");

-- AddForeignKey
ALTER TABLE "practice_publications" ADD CONSTRAINT "practice_publications_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "practice_publication_votes" ADD CONSTRAINT "practice_publication_votes_publication_id_fkey" FOREIGN KEY ("publication_id") REFERENCES "practice_publications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "practice_publication_votes" ADD CONSTRAINT "practice_publication_votes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "practice_referrals" ADD CONSTRAINT "practice_referrals_referred_id_fkey" FOREIGN KEY ("referred_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "practice_referrals" ADD CONSTRAINT "practice_referrals_referrer_id_fkey" FOREIGN KEY ("referrer_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "practice_credits" ADD CONSTRAINT "practice_credits_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "practice_redemptions" ADD CONSTRAINT "practice_redemptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "practice_redemptions" ADD CONSTRAINT "practice_redemptions_reward_id_fkey" FOREIGN KEY ("reward_id") REFERENCES "practice_rewards"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

