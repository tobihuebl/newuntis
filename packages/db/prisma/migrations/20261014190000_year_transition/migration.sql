-- CreateEnum
CREATE TYPE "PromotionDecisionKind" AS ENUM ('PROMOTE', 'REPEAT', 'EXAM', 'LEAVE');

-- AlterTable
ALTER TABLE "SchoolClass" ADD COLUMN     "previousClassId" TEXT;

-- CreateTable
CREATE TABLE "PromotionDecision" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "schoolYearId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "decision" "PromotionDecisionKind" NOT NULL,
    "note" TEXT,
    "examPassed" BOOLEAN,
    "decidedById" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "PromotionDecision_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PromotionDecision_tenantId_schoolYearId_idx" ON "PromotionDecision"("tenantId", "schoolYearId");

-- CreateIndex
CREATE UNIQUE INDEX "PromotionDecision_schoolYearId_studentId_key" ON "PromotionDecision"("schoolYearId", "studentId");

-- AddForeignKey
ALTER TABLE "SchoolClass" ADD CONSTRAINT "SchoolClass_previousClassId_fkey" FOREIGN KEY ("previousClassId") REFERENCES "SchoolClass"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PromotionDecision" ADD CONSTRAINT "PromotionDecision_schoolYearId_fkey" FOREIGN KEY ("schoolYearId") REFERENCES "SchoolYear"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PromotionDecision" ADD CONSTRAINT "PromotionDecision_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Row-Level-Security: Mandantentrennung wie bei allen Tabellen
ALTER TABLE "PromotionDecision" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "PromotionDecision"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));
