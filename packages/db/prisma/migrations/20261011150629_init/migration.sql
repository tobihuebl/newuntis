-- CreateEnum
CREATE TYPE "Role" AS ENUM ('STUDENT', 'GUARDIAN', 'TEACHER', 'HOMEROOM', 'PRINCIPAL', 'ADMIN');

-- CreateEnum
CREATE TYPE "PersonKind" AS ENUM ('STUDENT', 'TEACHER', 'GUARDIAN', 'STAFF');

-- CreateEnum
CREATE TYPE "WeekPattern" AS ENUM ('EVERY', 'A', 'B');

-- CreateEnum
CREATE TYPE "TimetableStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "OccurrenceStatus" AS ENUM ('SCHEDULED', 'CANCELLED', 'SUBSTITUTED', 'ROOM_CHANGED');

-- CreateEnum
CREATE TYPE "AttendanceStatus" AS ENUM ('PRESENT', 'LATE', 'ABSENT');

-- CreateEnum
CREATE TYPE "AbsenceStatus" AS ENUM ('REPORTED', 'EXCUSED', 'REJECTED', 'UNEXCUSED');

-- CreateEnum
CREATE TYPE "TeacherAbsenceKind" AS ENUM ('SICK', 'TRAINING', 'LEAVE', 'OTHER');

-- CreateEnum
CREATE TYPE "SubstitutionKind" AS ENUM ('SUBSTITUTE', 'CANCEL', 'ROOM_CHANGE', 'SUPERVISION');

-- CreateEnum
CREATE TYPE "SubstitutionStatus" AS ENUM ('OPEN', 'ASSIGNED', 'PUBLISHED');

-- CreateTable
CREATE TABLE "Tenant" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'Europe/Vienna',
    "settings" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Tenant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Person" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "kind" "PersonKind" NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "birthDate" DATE,
    "externalId" TEXT,
    "anonymizedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Person_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT,
    "totpSecret" TEXT,
    "totpEnabled" BOOLEAN NOT NULL DEFAULT false,
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoleAssignment" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "classId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RoleAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GuardianLink" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "guardianId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "canExcuse" BOOLEAN NOT NULL DEFAULT true,
    "validFrom" DATE NOT NULL,
    "validTo" DATE,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GuardianLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SchoolYear" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "startsOn" DATE NOT NULL,
    "endsOn" DATE NOT NULL,
    "isCurrent" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SchoolYear_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SchoolFreeDay" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "schoolYearId" TEXT NOT NULL,
    "fromDate" DATE NOT NULL,
    "toDate" DATE NOT NULL,
    "label" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SchoolFreeDay_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SchoolClass" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "schoolYearId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "homeroomTeacherId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SchoolClass_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Enrollment" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "classId" TEXT NOT NULL,
    "fromDate" DATE NOT NULL,
    "toDate" DATE,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Enrollment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Group" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "schoolYearId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Group_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GroupMember" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GroupMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Subject" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "color" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Subject_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Room" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "capacity" INTEGER,
    "kind" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Room_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Period" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "blocksDouble" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Period_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TimetableVersion" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "schoolYearId" TEXT NOT NULL,
    "status" "TimetableStatus" NOT NULL DEFAULT 'DRAFT',
    "validFrom" DATE NOT NULL,
    "publishedAt" TIMESTAMP(3),
    "publishedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TimetableVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Lesson" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "classId" TEXT,
    "groupId" TEXT,
    "roomId" TEXT,
    "weekday" INTEGER NOT NULL,
    "periodStart" INTEGER NOT NULL,
    "periodCount" INTEGER NOT NULL DEFAULT 1,
    "weekPattern" "WeekPattern" NOT NULL DEFAULT 'EVERY',
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Lesson_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LessonTeacher" (
    "lessonId" TEXT NOT NULL,
    "teacherId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,

    CONSTRAINT "LessonTeacher_pkey" PRIMARY KEY ("lessonId","teacherId")
);

-- CreateTable
CREATE TABLE "LessonRequirement" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "classId" TEXT,
    "groupId" TEXT,
    "teacherId" TEXT NOT NULL,
    "hoursPerWeek" INTEGER NOT NULL,
    "preferDouble" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LessonRequirement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Occurrence" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "lessonId" TEXT,
    "date" DATE NOT NULL,
    "periodStart" INTEGER NOT NULL,
    "periodCount" INTEGER NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "classId" TEXT,
    "groupId" TEXT,
    "subjectId" TEXT NOT NULL,
    "roomId" TEXT,
    "status" "OccurrenceStatus" NOT NULL DEFAULT 'SCHEDULED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Occurrence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OccurrenceTeacher" (
    "occurrenceId" TEXT NOT NULL,
    "teacherId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,

    CONSTRAINT "OccurrenceTeacher_pkey" PRIMARY KEY ("occurrenceId","teacherId")
);

-- CreateTable
CREATE TABLE "ClassbookEntry" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "occurrenceId" TEXT NOT NULL,
    "topic" TEXT,
    "homework" TEXT,
    "homeworkDueOn" DATE,
    "note" TEXT,
    "closedAt" TIMESTAMP(3),
    "closedById" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClassbookEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Attendance" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "occurrenceId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "status" "AttendanceStatus" NOT NULL DEFAULT 'PRESENT',
    "lateMinutes" INTEGER,
    "recordedById" TEXT NOT NULL,
    "clientMutationId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Attendance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Absence" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "fromAt" TIMESTAMP(3) NOT NULL,
    "toAt" TIMESTAMP(3) NOT NULL,
    "reason" TEXT,
    "status" "AbsenceStatus" NOT NULL DEFAULT 'REPORTED',
    "reportedById" TEXT NOT NULL,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewComment" TEXT,
    "attachmentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Absence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TeacherAbsence" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "teacherId" TEXT NOT NULL,
    "fromAt" TIMESTAMP(3) NOT NULL,
    "toAt" TIMESTAMP(3) NOT NULL,
    "kind" "TeacherAbsenceKind" NOT NULL,
    "approvedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TeacherAbsence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Substitution" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "occurrenceId" TEXT NOT NULL,
    "kind" "SubstitutionKind" NOT NULL,
    "substituteTeacherId" TEXT,
    "newRoomId" TEXT,
    "note" TEXT,
    "status" "SubstitutionStatus" NOT NULL DEFAULT 'OPEN',
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Substitution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Exam" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "classId" TEXT,
    "groupId" TEXT,
    "subjectId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "title" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Exam_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Thread" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Thread_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Message" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ThreadParticipant" (
    "threadId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "lastReadAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ThreadParticipant_pkey" PRIMARY KEY ("threadId","personId")
);

-- CreateTable
CREATE TABLE "Announcement" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "audience" JSONB NOT NULL,
    "requiresRead" BOOLEAN NOT NULL DEFAULT false,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Announcement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnnouncementRead" (
    "announcementId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "readAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AnnouncementRead_pkey" PRIMARY KEY ("announcementId","personId")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationPreference" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL,
    "quietFrom" TEXT,
    "quietTo" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotificationPreference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PushSubscription" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "keys" JSONB NOT NULL,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PushSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CalendarToken" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CalendarToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FileAsset" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "ownerId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FileAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "actorId" TEXT,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT,
    "meta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Tenant_slug_key" ON "Tenant"("slug");

-- CreateIndex
CREATE INDEX "Person_tenantId_kind_idx" ON "Person"("tenantId", "kind");

-- CreateIndex
CREATE INDEX "Person_tenantId_lastName_firstName_idx" ON "Person"("tenantId", "lastName", "firstName");

-- CreateIndex
CREATE UNIQUE INDEX "Person_tenantId_externalId_key" ON "Person"("tenantId", "externalId");

-- CreateIndex
CREATE UNIQUE INDEX "User_personId_key" ON "User"("personId");

-- CreateIndex
CREATE INDEX "User_tenantId_idx" ON "User"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "User_tenantId_email_key" ON "User"("tenantId", "email");

-- CreateIndex
CREATE INDEX "RoleAssignment_tenantId_personId_idx" ON "RoleAssignment"("tenantId", "personId");

-- CreateIndex
CREATE INDEX "RoleAssignment_tenantId_classId_idx" ON "RoleAssignment"("tenantId", "classId");

-- CreateIndex
CREATE INDEX "GuardianLink_tenantId_guardianId_idx" ON "GuardianLink"("tenantId", "guardianId");

-- CreateIndex
CREATE INDEX "GuardianLink_tenantId_studentId_idx" ON "GuardianLink"("tenantId", "studentId");

-- CreateIndex
CREATE INDEX "SchoolYear_tenantId_isCurrent_idx" ON "SchoolYear"("tenantId", "isCurrent");

-- CreateIndex
CREATE UNIQUE INDEX "SchoolYear_tenantId_name_key" ON "SchoolYear"("tenantId", "name");

-- CreateIndex
CREATE INDEX "SchoolFreeDay_tenantId_fromDate_toDate_idx" ON "SchoolFreeDay"("tenantId", "fromDate", "toDate");

-- CreateIndex
CREATE INDEX "SchoolClass_tenantId_schoolYearId_idx" ON "SchoolClass"("tenantId", "schoolYearId");

-- CreateIndex
CREATE UNIQUE INDEX "SchoolClass_tenantId_schoolYearId_name_key" ON "SchoolClass"("tenantId", "schoolYearId", "name");

-- CreateIndex
CREATE INDEX "Enrollment_tenantId_classId_idx" ON "Enrollment"("tenantId", "classId");

-- CreateIndex
CREATE INDEX "Enrollment_tenantId_studentId_idx" ON "Enrollment"("tenantId", "studentId");

-- CreateIndex
CREATE INDEX "Group_tenantId_schoolYearId_idx" ON "Group"("tenantId", "schoolYearId");

-- CreateIndex
CREATE INDEX "GroupMember_tenantId_studentId_idx" ON "GroupMember"("tenantId", "studentId");

-- CreateIndex
CREATE UNIQUE INDEX "GroupMember_groupId_studentId_key" ON "GroupMember"("groupId", "studentId");

-- CreateIndex
CREATE UNIQUE INDEX "Subject_tenantId_code_key" ON "Subject"("tenantId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "Room_tenantId_name_key" ON "Room"("tenantId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Period_tenantId_number_key" ON "Period"("tenantId", "number");

-- CreateIndex
CREATE INDEX "TimetableVersion_tenantId_schoolYearId_status_idx" ON "TimetableVersion"("tenantId", "schoolYearId", "status");

-- CreateIndex
CREATE INDEX "Lesson_tenantId_versionId_weekday_periodStart_idx" ON "Lesson"("tenantId", "versionId", "weekday", "periodStart");

-- CreateIndex
CREATE INDEX "Lesson_tenantId_classId_idx" ON "Lesson"("tenantId", "classId");

-- CreateIndex
CREATE INDEX "Lesson_tenantId_roomId_idx" ON "Lesson"("tenantId", "roomId");

-- CreateIndex
CREATE INDEX "LessonTeacher_tenantId_teacherId_idx" ON "LessonTeacher"("tenantId", "teacherId");

-- CreateIndex
CREATE INDEX "LessonRequirement_tenantId_versionId_idx" ON "LessonRequirement"("tenantId", "versionId");

-- CreateIndex
CREATE INDEX "Occurrence_tenantId_date_idx" ON "Occurrence"("tenantId", "date");

-- CreateIndex
CREATE INDEX "Occurrence_tenantId_classId_date_idx" ON "Occurrence"("tenantId", "classId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "Occurrence_lessonId_date_key" ON "Occurrence"("lessonId", "date");

-- CreateIndex
CREATE INDEX "OccurrenceTeacher_tenantId_teacherId_idx" ON "OccurrenceTeacher"("tenantId", "teacherId");

-- CreateIndex
CREATE UNIQUE INDEX "ClassbookEntry_occurrenceId_key" ON "ClassbookEntry"("occurrenceId");

-- CreateIndex
CREATE INDEX "ClassbookEntry_tenantId_closedAt_idx" ON "ClassbookEntry"("tenantId", "closedAt");

-- CreateIndex
CREATE INDEX "Attendance_tenantId_studentId_idx" ON "Attendance"("tenantId", "studentId");

-- CreateIndex
CREATE UNIQUE INDEX "Attendance_occurrenceId_studentId_key" ON "Attendance"("occurrenceId", "studentId");

-- CreateIndex
CREATE UNIQUE INDEX "Attendance_tenantId_clientMutationId_key" ON "Attendance"("tenantId", "clientMutationId");

-- CreateIndex
CREATE INDEX "Absence_tenantId_studentId_fromAt_idx" ON "Absence"("tenantId", "studentId", "fromAt");

-- CreateIndex
CREATE INDEX "Absence_tenantId_status_idx" ON "Absence"("tenantId", "status");

-- CreateIndex
CREATE INDEX "TeacherAbsence_tenantId_teacherId_fromAt_idx" ON "TeacherAbsence"("tenantId", "teacherId", "fromAt");

-- CreateIndex
CREATE UNIQUE INDEX "Substitution_occurrenceId_key" ON "Substitution"("occurrenceId");

-- CreateIndex
CREATE INDEX "Substitution_tenantId_status_idx" ON "Substitution"("tenantId", "status");

-- CreateIndex
CREATE INDEX "Exam_tenantId_date_idx" ON "Exam"("tenantId", "date");

-- CreateIndex
CREATE INDEX "Exam_tenantId_classId_date_idx" ON "Exam"("tenantId", "classId", "date");

-- CreateIndex
CREATE INDEX "Thread_tenantId_createdAt_idx" ON "Thread"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "Message_tenantId_threadId_createdAt_idx" ON "Message"("tenantId", "threadId", "createdAt");

-- CreateIndex
CREATE INDEX "ThreadParticipant_tenantId_personId_idx" ON "ThreadParticipant"("tenantId", "personId");

-- CreateIndex
CREATE INDEX "Announcement_tenantId_publishedAt_idx" ON "Announcement"("tenantId", "publishedAt");

-- CreateIndex
CREATE INDEX "AnnouncementRead_tenantId_personId_idx" ON "AnnouncementRead"("tenantId", "personId");

-- CreateIndex
CREATE INDEX "Notification_tenantId_personId_createdAt_idx" ON "Notification"("tenantId", "personId", "createdAt");

-- CreateIndex
CREATE INDEX "NotificationPreference_tenantId_personId_idx" ON "NotificationPreference"("tenantId", "personId");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationPreference_personId_type_channel_key" ON "NotificationPreference"("personId", "type", "channel");

-- CreateIndex
CREATE UNIQUE INDEX "PushSubscription_endpoint_key" ON "PushSubscription"("endpoint");

-- CreateIndex
CREATE INDEX "PushSubscription_tenantId_personId_idx" ON "PushSubscription"("tenantId", "personId");

-- CreateIndex
CREATE UNIQUE INDEX "CalendarToken_tokenHash_key" ON "CalendarToken"("tokenHash");

-- CreateIndex
CREATE INDEX "CalendarToken_tenantId_personId_idx" ON "CalendarToken"("tenantId", "personId");

-- CreateIndex
CREATE INDEX "FileAsset_tenantId_ownerId_idx" ON "FileAsset"("tenantId", "ownerId");

-- CreateIndex
CREATE INDEX "AuditLog_tenantId_createdAt_idx" ON "AuditLog"("tenantId", "createdAt");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoleAssignment" ADD CONSTRAINT "RoleAssignment_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoleAssignment" ADD CONSTRAINT "RoleAssignment_classId_fkey" FOREIGN KEY ("classId") REFERENCES "SchoolClass"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GuardianLink" ADD CONSTRAINT "GuardianLink_guardianId_fkey" FOREIGN KEY ("guardianId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GuardianLink" ADD CONSTRAINT "GuardianLink_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolFreeDay" ADD CONSTRAINT "SchoolFreeDay_schoolYearId_fkey" FOREIGN KEY ("schoolYearId") REFERENCES "SchoolYear"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolClass" ADD CONSTRAINT "SchoolClass_schoolYearId_fkey" FOREIGN KEY ("schoolYearId") REFERENCES "SchoolYear"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolClass" ADD CONSTRAINT "SchoolClass_homeroomTeacherId_fkey" FOREIGN KEY ("homeroomTeacherId") REFERENCES "Person"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Enrollment" ADD CONSTRAINT "Enrollment_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Enrollment" ADD CONSTRAINT "Enrollment_classId_fkey" FOREIGN KEY ("classId") REFERENCES "SchoolClass"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Group" ADD CONSTRAINT "Group_schoolYearId_fkey" FOREIGN KEY ("schoolYearId") REFERENCES "SchoolYear"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupMember" ADD CONSTRAINT "GroupMember_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupMember" ADD CONSTRAINT "GroupMember_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimetableVersion" ADD CONSTRAINT "TimetableVersion_schoolYearId_fkey" FOREIGN KEY ("schoolYearId") REFERENCES "SchoolYear"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lesson" ADD CONSTRAINT "Lesson_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "TimetableVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lesson" ADD CONSTRAINT "Lesson_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lesson" ADD CONSTRAINT "Lesson_classId_fkey" FOREIGN KEY ("classId") REFERENCES "SchoolClass"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lesson" ADD CONSTRAINT "Lesson_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lesson" ADD CONSTRAINT "Lesson_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LessonTeacher" ADD CONSTRAINT "LessonTeacher_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "Lesson"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LessonTeacher" ADD CONSTRAINT "LessonTeacher_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LessonRequirement" ADD CONSTRAINT "LessonRequirement_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "TimetableVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LessonRequirement" ADD CONSTRAINT "LessonRequirement_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LessonRequirement" ADD CONSTRAINT "LessonRequirement_classId_fkey" FOREIGN KEY ("classId") REFERENCES "SchoolClass"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LessonRequirement" ADD CONSTRAINT "LessonRequirement_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LessonRequirement" ADD CONSTRAINT "LessonRequirement_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Occurrence" ADD CONSTRAINT "Occurrence_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "Lesson"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Occurrence" ADD CONSTRAINT "Occurrence_classId_fkey" FOREIGN KEY ("classId") REFERENCES "SchoolClass"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Occurrence" ADD CONSTRAINT "Occurrence_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Occurrence" ADD CONSTRAINT "Occurrence_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Occurrence" ADD CONSTRAINT "Occurrence_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OccurrenceTeacher" ADD CONSTRAINT "OccurrenceTeacher_occurrenceId_fkey" FOREIGN KEY ("occurrenceId") REFERENCES "Occurrence"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OccurrenceTeacher" ADD CONSTRAINT "OccurrenceTeacher_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassbookEntry" ADD CONSTRAINT "ClassbookEntry_occurrenceId_fkey" FOREIGN KEY ("occurrenceId") REFERENCES "Occurrence"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attendance" ADD CONSTRAINT "Attendance_occurrenceId_fkey" FOREIGN KEY ("occurrenceId") REFERENCES "Occurrence"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attendance" ADD CONSTRAINT "Attendance_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Absence" ADD CONSTRAINT "Absence_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Absence" ADD CONSTRAINT "Absence_attachmentId_fkey" FOREIGN KEY ("attachmentId") REFERENCES "FileAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeacherAbsence" ADD CONSTRAINT "TeacherAbsence_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Substitution" ADD CONSTRAINT "Substitution_occurrenceId_fkey" FOREIGN KEY ("occurrenceId") REFERENCES "Occurrence"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Substitution" ADD CONSTRAINT "Substitution_substituteTeacherId_fkey" FOREIGN KEY ("substituteTeacherId") REFERENCES "Person"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Substitution" ADD CONSTRAINT "Substitution_newRoomId_fkey" FOREIGN KEY ("newRoomId") REFERENCES "Room"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Exam" ADD CONSTRAINT "Exam_classId_fkey" FOREIGN KEY ("classId") REFERENCES "SchoolClass"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Exam" ADD CONSTRAINT "Exam_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Exam" ADD CONSTRAINT "Exam_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "Thread"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ThreadParticipant" ADD CONSTRAINT "ThreadParticipant_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "Thread"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ThreadParticipant" ADD CONSTRAINT "ThreadParticipant_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnnouncementRead" ADD CONSTRAINT "AnnouncementRead_announcementId_fkey" FOREIGN KEY ("announcementId") REFERENCES "Announcement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnnouncementRead" ADD CONSTRAINT "AnnouncementRead_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationPreference" ADD CONSTRAINT "NotificationPreference_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PushSubscription" ADD CONSTRAINT "PushSubscription_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarToken" ADD CONSTRAINT "CalendarToken_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
