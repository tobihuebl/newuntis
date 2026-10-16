-- AlterTable
ALTER TABLE "Exam" ADD COLUMN     "periodCount" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "periodStart" INTEGER;

-- AlterTable
ALTER TABLE "Occurrence" ADD COLUMN     "displacedByExamId" TEXT;

-- AddForeignKey
ALTER TABLE "Occurrence" ADD CONSTRAINT "Occurrence_displacedByExamId_fkey" FOREIGN KEY ("displacedByExamId") REFERENCES "Exam"("id") ON DELETE SET NULL ON UPDATE CASCADE;

