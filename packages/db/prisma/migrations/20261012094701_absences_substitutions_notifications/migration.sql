-- CreateEnum
CREATE TYPE "AbsenceOrigin" AS ENUM ('CLASSBOOK', 'REPORT');

-- AlterEnum
ALTER TYPE "AbsenceStatus" ADD VALUE 'OPEN';

-- AlterTable
ALTER TABLE "Absence" ADD COLUMN     "lastReminderAt" TIMESTAMPTZ(3),
ADD COLUMN     "origin" "AbsenceOrigin" NOT NULL DEFAULT 'REPORT',
ADD COLUMN     "reasonCode" TEXT,
ADD COLUMN     "remindersSent" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "FileAsset" ADD COLUMN     "scanStatus" TEXT NOT NULL DEFAULT 'PENDING',
ADD COLUMN     "scannedAt" TIMESTAMPTZ(3);

-- AlterTable
ALTER TABLE "Notification" ADD COLUMN     "emailedAt" TIMESTAMPTZ(3),
ADD COLUMN     "pushedAt" TIMESTAMPTZ(3);

-- AlterTable
ALTER TABLE "Substitution" ADD COLUMN     "publishedById" TEXT,
ADD COLUMN     "teacherAbsenceId" TEXT;

-- AlterTable
ALTER TABLE "TeacherAbsence" ADD COLUMN     "createdById" TEXT,
ADD COLUMN     "note" TEXT;

-- CreateIndex
CREATE INDEX "Notification_tenantId_personId_type_pushedAt_idx" ON "Notification"("tenantId", "personId", "type", "pushedAt");

-- AddForeignKey
ALTER TABLE "Substitution" ADD CONSTRAINT "Substitution_teacherAbsenceId_fkey" FOREIGN KEY ("teacherAbsenceId") REFERENCES "TeacherAbsence"("id") ON DELETE SET NULL ON UPDATE CASCADE;
