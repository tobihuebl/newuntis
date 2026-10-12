-- AlterTable
ALTER TABLE "Attendance" ADD COLUMN     "clientUpdatedAt" TIMESTAMPTZ(3);

-- AlterTable
ALTER TABLE "ClassbookEntry" ADD COLUMN     "lastMutationId" TEXT,
ADD COLUMN     "updatedById" TEXT;
