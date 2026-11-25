-- AlterTable
ALTER TABLE "attendance_records" ADD COLUMN     "last_scanned_at" TIMESTAMPTZ(3);

-- AlterTable
ALTER TABLE "students" ALTER COLUMN "qr_identifier" DROP DEFAULT;
