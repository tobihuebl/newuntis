-- AlterTable
ALTER TABLE "Person" ADD COLUMN     "email" TEXT;

-- CreateTable
CREATE TABLE "GuardianCode" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "maxUses" INTEGER NOT NULL DEFAULT 2,
    "uses" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GuardianCode_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "GuardianCode_codeHash_key" ON "GuardianCode"("codeHash");

-- CreateIndex
CREATE INDEX "GuardianCode_tenantId_studentId_idx" ON "GuardianCode"("tenantId", "studentId");

-- CreateIndex
CREATE INDEX "Person_tenantId_email_idx" ON "Person"("tenantId", "email");

-- AddForeignKey
ALTER TABLE "GuardianCode" ADD CONSTRAINT "GuardianCode_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Row-Level-Security für GuardianCode (siehe Migration "enable_rls"); Rechte für sp_app kommen über die Default-Privilegien
ALTER TABLE "GuardianCode" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "GuardianCode"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));
