-- Stundenplan-Assistent (M7, ADR 0012): Planungswünsche, Läufe des Solvers, festgepinnte Stunden.

-- CreateEnum
CREATE TYPE "PlanningConstraintKind" AS ENUM ('TEACHER_UNAVAILABLE', 'TEACHER_MAX_PER_DAY', 'CLASS_MAX_PER_DAY', 'SUBJECT_ROOMS', 'CLASS_HOME_ROOM', 'SUBJECT_NOT_PERIODS', 'NO_STUDENT_GAPS');

-- CreateEnum
CREATE TYPE "PlanningSource" AS ENUM ('FORM', 'TEXT', 'AI');

-- CreateEnum
CREATE TYPE "PlanningRunStatus" AS ENUM ('QUEUED', 'RUNNING', 'DONE', 'FAILED');

-- AlterTable
ALTER TABLE "Lesson" ADD COLUMN     "pinned" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "PlanningConstraint" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "schoolYearId" TEXT NOT NULL,
    "kind" "PlanningConstraintKind" NOT NULL,
    "hard" BOOLEAN NOT NULL DEFAULT true,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "teacherId" TEXT,
    "classId" TEXT,
    "subjectId" TEXT,
    "roomIds" TEXT[],
    "weekday" INTEGER,
    "periods" INTEGER[],
    "max" INTEGER,
    "source" "PlanningSource" NOT NULL DEFAULT 'FORM',
    "text" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "PlanningConstraint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlanningRun" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "schoolYearId" TEXT NOT NULL,
    "sourceVersionId" TEXT,
    "resultVersionId" TEXT,
    "status" "PlanningRunStatus" NOT NULL DEFAULT 'QUEUED',
    "scope" JSONB NOT NULL,
    "seed" INTEGER NOT NULL,
    "stats" JSONB,
    "unplaced" JSONB,
    "error" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMPTZ(3),
    "finishedAt" TIMESTAMPTZ(3),
    CONSTRAINT "PlanningRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PlanningConstraint_tenantId_schoolYearId_idx" ON "PlanningConstraint"("tenantId", "schoolYearId");

-- CreateIndex
CREATE INDEX "PlanningRun_tenantId_schoolYearId_createdAt_idx" ON "PlanningRun"("tenantId", "schoolYearId", "createdAt");

-- AddForeignKey
ALTER TABLE "PlanningConstraint" ADD CONSTRAINT "PlanningConstraint_schoolYearId_fkey" FOREIGN KEY ("schoolYearId") REFERENCES "SchoolYear"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlanningConstraint" ADD CONSTRAINT "PlanningConstraint_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "Person"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlanningConstraint" ADD CONSTRAINT "PlanningConstraint_classId_fkey" FOREIGN KEY ("classId") REFERENCES "SchoolClass"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlanningConstraint" ADD CONSTRAINT "PlanningConstraint_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlanningRun" ADD CONSTRAINT "PlanningRun_schoolYearId_fkey" FOREIGN KEY ("schoolYearId") REFERENCES "SchoolYear"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Row-Level-Security: Mandantentrennung wie bei allen Tabellen
ALTER TABLE "PlanningConstraint" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "PlanningConstraint"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

ALTER TABLE "PlanningRun" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "PlanningRun"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));
