-- CreateEnum
CREATE TYPE "AssessmentKind" AS ENUM ('SCHULARBEIT', 'TEST', 'MUENDLICH', 'MITARBEIT');

-- CreateTable
CREATE TABLE "GradeWeighting" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "schoolYearId" TEXT NOT NULL,
    "courseKey" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "classId" TEXT,
    "groupId" TEXT,
    "weights" JSONB NOT NULL,
    "updatedById" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "GradeWeighting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Assessment" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "schoolYearId" TEXT NOT NULL,
    "courseKey" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "classId" TEXT,
    "groupId" TEXT,
    "kind" "AssessmentKind" NOT NULL,
    "title" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "examId" TEXT,
    "releasedAt" TIMESTAMPTZ(3),
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Assessment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Grade" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "assessmentId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "value" INTEGER NOT NULL,
    "comment" TEXT,
    "updatedById" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Grade_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GradeWeighting_tenantId_schoolYearId_idx" ON "GradeWeighting"("tenantId", "schoolYearId");

-- CreateIndex
CREATE UNIQUE INDEX "GradeWeighting_schoolYearId_courseKey_key" ON "GradeWeighting"("schoolYearId", "courseKey");

-- CreateIndex
CREATE UNIQUE INDEX "Assessment_examId_key" ON "Assessment"("examId");

-- CreateIndex
CREATE INDEX "Assessment_tenantId_schoolYearId_courseKey_idx" ON "Assessment"("tenantId", "schoolYearId", "courseKey");

-- CreateIndex
CREATE INDEX "Grade_tenantId_studentId_idx" ON "Grade"("tenantId", "studentId");

-- CreateIndex
CREATE UNIQUE INDEX "Grade_assessmentId_studentId_key" ON "Grade"("assessmentId", "studentId");

-- AddForeignKey
ALTER TABLE "GradeWeighting" ADD CONSTRAINT "GradeWeighting_schoolYearId_fkey" FOREIGN KEY ("schoolYearId") REFERENCES "SchoolYear"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GradeWeighting" ADD CONSTRAINT "GradeWeighting_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GradeWeighting" ADD CONSTRAINT "GradeWeighting_classId_fkey" FOREIGN KEY ("classId") REFERENCES "SchoolClass"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GradeWeighting" ADD CONSTRAINT "GradeWeighting_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assessment" ADD CONSTRAINT "Assessment_schoolYearId_fkey" FOREIGN KEY ("schoolYearId") REFERENCES "SchoolYear"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assessment" ADD CONSTRAINT "Assessment_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assessment" ADD CONSTRAINT "Assessment_classId_fkey" FOREIGN KEY ("classId") REFERENCES "SchoolClass"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assessment" ADD CONSTRAINT "Assessment_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assessment" ADD CONSTRAINT "Assessment_examId_fkey" FOREIGN KEY ("examId") REFERENCES "Exam"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Grade" ADD CONSTRAINT "Grade_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "Assessment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Grade" ADD CONSTRAINT "Grade_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Row-Level-Security: Mandantentrennung wie bei allen Tabellen
ALTER TABLE "GradeWeighting" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "GradeWeighting"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

ALTER TABLE "Assessment" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Assessment"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

ALTER TABLE "Grade" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Grade"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));
