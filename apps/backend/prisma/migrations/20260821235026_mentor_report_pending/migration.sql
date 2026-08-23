-- AlterEnum
ALTER TYPE "MentorReportStatus" ADD VALUE 'PENDING';

-- AlterTable
ALTER TABLE "mentor_reports" ALTER COLUMN "status" SET DEFAULT 'PENDING';
