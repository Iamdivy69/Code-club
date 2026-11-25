-- AlterTable
ALTER TABLE "attendance_sessions" ADD COLUMN     "deleted_at" TIMESTAMPTZ(3),
ADD COLUMN     "deleted_by" UUID;
