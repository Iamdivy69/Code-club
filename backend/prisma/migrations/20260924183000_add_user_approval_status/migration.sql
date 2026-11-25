-- CreateEnum
CREATE TYPE "ApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- AlterTable
ALTER TABLE "users" ADD COLUMN "approval_status" "ApprovalStatus" NOT NULL DEFAULT 'APPROVED',
ADD COLUMN "approved_at" TIMESTAMPTZ(3),
ADD COLUMN "approved_by" UUID,
ADD COLUMN "rejection_reason" TEXT;

-- CreateIndex
CREATE INDEX "users_approval_status_idx" ON "users"("approval_status");
