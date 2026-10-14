-- AlterTable
ALTER TABLE "Person" ADD COLUMN     "employmentHours" DOUBLE PRECISION,
ADD COLUMN     "teachingHours" DOUBLE PRECISION;

-- CreateTable
CREATE TABLE "TeacherSubject" (
    "tenantId" TEXT NOT NULL,
    "teacherId" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TeacherSubject_pkey" PRIMARY KEY ("teacherId","subjectId")
);

-- CreateIndex
CREATE INDEX "TeacherSubject_tenantId_subjectId_idx" ON "TeacherSubject"("tenantId", "subjectId");

-- AddForeignKey
ALTER TABLE "TeacherSubject" ADD CONSTRAINT "TeacherSubject_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeacherSubject" ADD CONSTRAINT "TeacherSubject_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Row-Level-Security: Mandantentrennung wie bei allen Tabellen
ALTER TABLE "TeacherSubject" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "TeacherSubject"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));
