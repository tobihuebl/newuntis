-- CreateEnum
CREATE TYPE "AbsenceWarningKind" AS ENUM ('UNEXCUSED', 'FREQUENT');

-- CreateTable
CREATE TABLE "AbsenceWarning" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "schoolYearId" TEXT NOT NULL,
    "kind" "AbsenceWarningKind" NOT NULL,
    "notifiedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "AbsenceWarning_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AbsenceWarning_tenantId_schoolYearId_idx" ON "AbsenceWarning"("tenantId", "schoolYearId");

-- CreateIndex
CREATE UNIQUE INDEX "AbsenceWarning_studentId_schoolYearId_kind_key" ON "AbsenceWarning"("studentId", "schoolYearId", "kind");

-- AddForeignKey
ALTER TABLE "AbsenceWarning" ADD CONSTRAINT "AbsenceWarning_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AbsenceWarning" ADD CONSTRAINT "AbsenceWarning_schoolYearId_fkey" FOREIGN KEY ("schoolYearId") REFERENCES "SchoolYear"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Row-Level-Security: Mandantentrennung wie bei allen Tabellen
ALTER TABLE "AbsenceWarning" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "AbsenceWarning"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));
