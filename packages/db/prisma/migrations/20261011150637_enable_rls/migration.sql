-- Row-Level-Security: jede Tabelle mit tenantId ist auf den Mandanten der Anfrage beschränkt.
-- Die API setzt pro Anfrage innerhalb der Transaktion: SET LOCAL app.tenant_id = '<id>'.
-- ENABLE (nicht FORCE): der Tabelleneigentümer (Migrationen, Seed) umgeht die Policy;
-- die Laufzeit-Rolle der Anwendung ist in M1 eine eigene, nicht privilegierte Rolle.

ALTER TABLE "Person" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Person"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

ALTER TABLE "User" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "User"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

ALTER TABLE "RoleAssignment" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "RoleAssignment"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

ALTER TABLE "GuardianLink" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "GuardianLink"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

ALTER TABLE "SchoolYear" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "SchoolYear"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

ALTER TABLE "SchoolFreeDay" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "SchoolFreeDay"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

ALTER TABLE "SchoolClass" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "SchoolClass"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

ALTER TABLE "Enrollment" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Enrollment"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

ALTER TABLE "Group" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Group"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

ALTER TABLE "GroupMember" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "GroupMember"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

ALTER TABLE "Subject" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Subject"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

ALTER TABLE "Room" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Room"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

ALTER TABLE "Period" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Period"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

ALTER TABLE "TimetableVersion" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "TimetableVersion"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

ALTER TABLE "Lesson" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Lesson"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

ALTER TABLE "LessonTeacher" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "LessonTeacher"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

ALTER TABLE "LessonRequirement" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "LessonRequirement"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

ALTER TABLE "Occurrence" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Occurrence"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

ALTER TABLE "OccurrenceTeacher" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "OccurrenceTeacher"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

ALTER TABLE "ClassbookEntry" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "ClassbookEntry"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

ALTER TABLE "Attendance" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Attendance"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

ALTER TABLE "Absence" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Absence"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

ALTER TABLE "TeacherAbsence" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "TeacherAbsence"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

ALTER TABLE "Substitution" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Substitution"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

ALTER TABLE "Exam" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Exam"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

ALTER TABLE "Thread" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Thread"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

ALTER TABLE "Message" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Message"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

ALTER TABLE "ThreadParticipant" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "ThreadParticipant"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

ALTER TABLE "Announcement" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Announcement"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

ALTER TABLE "AnnouncementRead" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "AnnouncementRead"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

ALTER TABLE "Notification" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Notification"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

ALTER TABLE "NotificationPreference" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "NotificationPreference"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

ALTER TABLE "PushSubscription" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "PushSubscription"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

ALTER TABLE "CalendarToken" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "CalendarToken"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

ALTER TABLE "FileAsset" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "FileAsset"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

ALTER TABLE "AuditLog" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "AuditLog"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));
