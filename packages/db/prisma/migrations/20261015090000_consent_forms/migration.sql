-- CreateEnum
CREATE TYPE "ConsentAnswerKind" AS ENUM ('OPEN', 'YES', 'NO');

-- CreateTable
CREATE TABLE "ConsentForm" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "dueOn" DATE,
    "createdById" TEXT NOT NULL,
    "closedAt" TIMESTAMPTZ(3),
    "remindedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ConsentForm_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConsentFormAnswer" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "formId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "classId" TEXT NOT NULL,
    "answer" "ConsentAnswerKind" NOT NULL DEFAULT 'OPEN',
    "note" TEXT,
    "answeredById" TEXT,
    "answeredAt" TIMESTAMPTZ(3),
    "onPaper" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ConsentFormAnswer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ConsentForm_tenantId_createdAt_idx" ON "ConsentForm"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "ConsentFormAnswer_tenantId_studentId_idx" ON "ConsentFormAnswer"("tenantId", "studentId");

-- CreateIndex
CREATE INDEX "ConsentFormAnswer_tenantId_classId_idx" ON "ConsentFormAnswer"("tenantId", "classId");

-- CreateIndex
CREATE UNIQUE INDEX "ConsentFormAnswer_formId_studentId_key" ON "ConsentFormAnswer"("formId", "studentId");

-- AddForeignKey
ALTER TABLE "ConsentForm" ADD CONSTRAINT "ConsentForm_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsentFormAnswer" ADD CONSTRAINT "ConsentFormAnswer_formId_fkey" FOREIGN KEY ("formId") REFERENCES "ConsentForm"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsentFormAnswer" ADD CONSTRAINT "ConsentFormAnswer_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsentFormAnswer" ADD CONSTRAINT "ConsentFormAnswer_answeredById_fkey" FOREIGN KEY ("answeredById") REFERENCES "Person"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Row-Level-Security: Mandantentrennung wie bei allen Tabellen
ALTER TABLE "ConsentForm" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "ConsentForm"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

ALTER TABLE "ConsentFormAnswer" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "ConsentFormAnswer"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));
