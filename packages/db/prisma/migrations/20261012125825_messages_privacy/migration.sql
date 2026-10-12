-- M6: Nachrichten, Rundschreiben, Datenschutz (ADR 0009).
-- "Announcement" war bis M6 ungenutzt und ist leer; createdById kann daher ohne Standardwert NOT NULL sein.
-- CreateEnum
CREATE TYPE "PrivacyRequestKind" AS ENUM ('ACCESS', 'RECTIFICATION', 'ERASURE', 'RESTRICTION');

-- CreateEnum
CREATE TYPE "PrivacyRequestStatus" AS ENUM ('OPEN', 'DONE', 'REJECTED');

-- AlterTable
ALTER TABLE "Announcement" ADD COLUMN     "createdById" TEXT NOT NULL,
ADD COLUMN     "remindedAt" TIMESTAMPTZ(3);

-- AlterTable
ALTER TABLE "AnnouncementRead" ALTER COLUMN "readAt" DROP NOT NULL;

-- AlterTable
ALTER TABLE "Person" ADD COLUMN     "restrictedAt" TIMESTAMPTZ(3);

-- AlterTable
ALTER TABLE "Thread" ADD COLUMN     "aboutStudentId" TEXT,
ADD COLUMN     "classId" TEXT,
ADD COLUMN     "lastMessageAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "onboardedAt" TIMESTAMPTZ(3);

-- CreateTable
CREATE TABLE "PrivacyRequest" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "kind" "PrivacyRequestKind" NOT NULL,
    "status" "PrivacyRequestStatus" NOT NULL DEFAULT 'OPEN',
    "note" TEXT,
    "createdById" TEXT NOT NULL,
    "resolvedById" TEXT,
    "resolvedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "PrivacyRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Consent" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "acceptedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Consent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PrivacyRequest_tenantId_status_createdAt_idx" ON "PrivacyRequest"("tenantId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "Consent_tenantId_personId_idx" ON "Consent"("tenantId", "personId");

-- CreateIndex
CREATE UNIQUE INDEX "Consent_personId_kind_version_key" ON "Consent"("personId", "kind", "version");

-- CreateIndex
CREATE INDEX "Message_tenantId_createdAt_idx" ON "Message"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "Thread_tenantId_lastMessageAt_idx" ON "Thread"("tenantId", "lastMessageAt");

-- AddForeignKey
ALTER TABLE "Thread" ADD CONSTRAINT "Thread_aboutStudentId_fkey" FOREIGN KEY ("aboutStudentId") REFERENCES "Person"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Announcement" ADD CONSTRAINT "Announcement_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrivacyRequest" ADD CONSTRAINT "PrivacyRequest_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Consent" ADD CONSTRAINT "Consent_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Row-Level-Security für die neuen Tabellen (siehe Migration "enable_rls")
ALTER TABLE "PrivacyRequest" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "PrivacyRequest"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

ALTER TABLE "Consent" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Consent"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

-- Aufbewahrung des Audit-Logs: sp_app hat auf "AuditLog" kein DELETE (nur anhängen). Das Löschen nach Ablauf
-- der Frist läuft über diese Funktion mit den Rechten des Eigentümers, nur für den gesetzten Mandanten und
-- nie für Einträge, die jünger als 90 Tage sind.
CREATE OR REPLACE FUNCTION prune_audit_log(cutoff timestamptz) RETURNS integer
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  tenant text := current_setting('app.tenant_id', true);
  n integer;
BEGIN
  IF tenant IS NULL OR tenant = '' THEN
    RAISE EXCEPTION 'app.tenant_id ist nicht gesetzt';
  END IF;
  IF cutoff > now() - interval '90 days' THEN
    RAISE EXCEPTION 'Audit-Einträge der letzten 90 Tage werden nie gelöscht';
  END IF;
  DELETE FROM "AuditLog" WHERE "tenantId" = tenant AND "createdAt" < cutoff;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END
$$;
REVOKE ALL ON FUNCTION prune_audit_log(timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION prune_audit_log(timestamptz) TO sp_app;
