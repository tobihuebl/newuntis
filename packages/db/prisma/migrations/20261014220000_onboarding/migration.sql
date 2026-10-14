-- CreateEnum
CREATE TYPE "OnboardingStepStatus" AS ENUM ('OPEN', 'DONE', 'SKIPPED');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "avatar" TEXT,
ADD COLUMN     "username" TEXT,
ALTER COLUMN "email" DROP NOT NULL;

-- CreateTable
CREATE TABLE "AccessCode" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "usedAt" TIMESTAMPTZ(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "AccessCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OnboardingProgress" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "flow" TEXT NOT NULL,
    "flowVersion" INTEGER NOT NULL,
    "stepId" TEXT NOT NULL,
    "status" "OnboardingStepStatus" NOT NULL DEFAULT 'OPEN',
    "viewedAt" TIMESTAMPTZ(3),
    "doneAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "OnboardingProgress_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AccessCode_codeHash_key" ON "AccessCode"("codeHash");

-- CreateIndex
CREATE INDEX "AccessCode_tenantId_personId_idx" ON "AccessCode"("tenantId", "personId");

-- CreateIndex
CREATE INDEX "OnboardingProgress_tenantId_flow_stepId_idx" ON "OnboardingProgress"("tenantId", "flow", "stepId");

-- CreateIndex
CREATE UNIQUE INDEX "OnboardingProgress_userId_stepId_key" ON "OnboardingProgress"("userId", "stepId");

-- CreateIndex
CREATE UNIQUE INDEX "User_tenantId_username_key" ON "User"("tenantId", "username");

-- AddForeignKey
ALTER TABLE "AccessCode" ADD CONSTRAINT "AccessCode_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OnboardingProgress" ADD CONSTRAINT "OnboardingProgress_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Anmeldung: E-Mail oder Benutzername (Schüler:innen mit Zugangscode)
ALTER TABLE "User" ADD CONSTRAINT "User_login_check" CHECK ("email" IS NOT NULL OR "username" IS NOT NULL);

-- Bisher eingeführte Personen haben Willkommen und Benachrichtigungen schon gesehen (ADR 0020)
INSERT INTO "OnboardingProgress" ("id", "tenantId", "userId", "flow", "flowVersion", "stepId", "status", "viewedAt", "doneAt", "updatedAt")
SELECT 'legacy-push-' || "id", "tenantId", "id", 'legacy', 0, 'push', 'DONE', "onboardedAt", "onboardedAt", CURRENT_TIMESTAMP
FROM "User" WHERE "onboardedAt" IS NOT NULL;

-- Row-Level-Security: Mandantentrennung wie bei allen Tabellen
ALTER TABLE "AccessCode" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "AccessCode"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

ALTER TABLE "OnboardingProgress" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "OnboardingProgress"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));
