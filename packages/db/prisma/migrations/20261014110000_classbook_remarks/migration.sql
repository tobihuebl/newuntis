-- CreateTable
CREATE TABLE "ClassbookRemark" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "occurrenceId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "clientMutationId" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClassbookRemark_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ClassbookRemark_tenantId_studentId_idx" ON "ClassbookRemark"("tenantId", "studentId");

-- CreateIndex
CREATE INDEX "ClassbookRemark_tenantId_occurrenceId_idx" ON "ClassbookRemark"("tenantId", "occurrenceId");

-- CreateIndex
CREATE INDEX "ClassbookRemark_tenantId_createdAt_idx" ON "ClassbookRemark"("tenantId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ClassbookRemark_tenantId_clientMutationId_key" ON "ClassbookRemark"("tenantId", "clientMutationId");

-- AddForeignKey
ALTER TABLE "ClassbookRemark" ADD CONSTRAINT "ClassbookRemark_occurrenceId_fkey" FOREIGN KEY ("occurrenceId") REFERENCES "Occurrence"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassbookRemark" ADD CONSTRAINT "ClassbookRemark_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassbookRemark" ADD CONSTRAINT "ClassbookRemark_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Row-Level-Security: Mandantentrennung wie bei allen Tabellen
ALTER TABLE "ClassbookRemark" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "ClassbookRemark"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));
