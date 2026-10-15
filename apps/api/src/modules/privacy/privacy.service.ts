import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import type { Tx } from '@sp/db';
import { tenantSettingsSchema, type PersonExport } from '@sp/shared';
import { AuditService } from '../audit/audit.service';
import { FilesService } from '../files/files.service';
import { QueueService } from '../jobs/queue.service';
import { fullName } from '../messages/recipients';
import { PrismaService } from '../prisma/prisma.service';
import { iso } from '../timetable/data';

export const QUEUE_RETENTION = 'retention-daily';
const DAY = 86_400_000;
const isoOrNull = (d: Date | null) => (d ? d.toISOString() : null);
const dayOrNull = (d: Date | null) => (d ? iso(d) : null);

/**
 * Datenschutz (Spec Abschnitt 13): Auskunft als Export und Aufbewahrungsfristen (`settings.retention`).
 * Anfragen und Anonymisierung steuert der PrivacyController.
 */
@Injectable()
export class PrivacyService implements OnModuleInit {
  private readonly logger = new Logger(PrivacyService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly files: FilesService,
    private readonly queue: QueueService,
  ) {}

  onModuleInit(): void {
    this.queue.register(QUEUE_RETENTION, () => this.retentionAllTenants(), { cron: '30 3 * * *' });
  }

  /** Alle zur Person gespeicherten Daten (Art. 15 DSGVO). Inhalte anderer Personen bleiben außen vor. */
  async buildExport(tx: Tx, tenantId: string, personId: string): Promise<PersonExport> {
    const tenant = await tx.tenant.findUniqueOrThrow({ where: { id: tenantId } });
    const p = await tx.person.findUniqueOrThrow({
      where: { id: personId },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            totpEnabled: true,
            lastLoginAt: true,
            createdAt: true,
            sessions: { select: { userAgent: true, lastSeenAt: true } },
          },
        },
        roles: { select: { role: true, class: { select: { name: true } } } },
        enrollments: {
          select: { fromDate: true, toDate: true, class: { select: { name: true } } },
        },
        guardianLinks: {
          select: {
            validFrom: true,
            validTo: true,
            student: { select: { firstName: true, lastName: true } },
          },
        },
        studentLinks: {
          select: {
            validFrom: true,
            validTo: true,
            guardian: { select: { firstName: true, lastName: true } },
          },
        },
      },
    });
    const [
      attendance,
      absences,
      teacherAbsences,
      messages,
      reads,
      notifications,
      prefs,
      consents,
      audit,
      remarks,
      grades,
      consentAnswers,
    ] = await Promise.all([
      tx.attendance.findMany({
        where: { studentId: personId },
        orderBy: { occurrence: { startsAt: 'asc' } },
        select: {
          status: true,
          lateMinutes: true,
          occurrence: { select: { date: true, subject: { select: { name: true } } } },
        },
      }),
      tx.absence.findMany({ where: { studentId: personId }, orderBy: { fromAt: 'asc' } }),
      tx.teacherAbsence.findMany({ where: { teacherId: personId }, orderBy: { fromAt: 'asc' } }),
      tx.message.findMany({
        where: { senderId: personId },
        orderBy: { createdAt: 'asc' },
        select: { body: true, createdAt: true, thread: { select: { subject: true } } },
      }),
      tx.announcementRead.findMany({
        where: { personId },
        select: { readAt: true, announcement: { select: { title: true } } },
      }),
      tx.notification.findMany({
        where: { personId },
        orderBy: { createdAt: 'asc' },
        select: { type: true, createdAt: true, readAt: true },
      }),
      tx.notificationPreference.findMany({ where: { personId } }),
      tx.consent.findMany({ where: { personId }, orderBy: { acceptedAt: 'asc' } }),
      tx.auditLog.findMany({
        where: { actorId: personId },
        orderBy: { createdAt: 'asc' },
        take: 5000,
        select: { createdAt: true, action: true, entity: true },
      }),
      tx.classbookRemark.findMany({
        where: { studentId: personId },
        orderBy: { createdAt: 'asc' },
        select: {
          text: true,
          createdAt: true,
          occurrence: { select: { date: true, subject: { select: { name: true } } } },
        },
      }),
      // Freigegebene Noten (PN-02); nicht freigegebene sind noch in Arbeit der Lehrkraft
      tx.grade.findMany({
        where: { studentId: personId, assessment: { releasedAt: { not: null } } },
        orderBy: { assessment: { date: 'asc' } },
        select: {
          value: true,
          comment: true,
          assessment: {
            select: { date: true, kind: true, title: true, subject: { select: { name: true } } },
          },
        },
      }),
      // Einverständniserklärungen (KO-05): über das Kind und als Elternteil gegebene Antworten
      tx.consentFormAnswer.findMany({
        where: { OR: [{ studentId: personId }, { answeredById: personId }] },
        orderBy: { createdAt: 'asc' },
        select: {
          answer: true,
          note: true,
          answeredAt: true,
          onPaper: true,
          student: { select: { firstName: true, lastName: true } },
          form: { select: { title: true, dueOn: true } },
        },
      }),
    ]);
    return {
      generatedAt: new Date().toISOString(),
      school: tenant.name,
      person: {
        id: p.id,
        kind: p.kind,
        firstName: p.firstName,
        lastName: p.lastName,
        birthDate: dayOrNull(p.birthDate),
        externalId: p.externalId,
        email: p.email,
        anonymized: p.anonymizedAt !== null,
        restricted: p.restrictedAt !== null,
      },
      account: p.user
        ? {
            email: p.user.email,
            twoFactor: p.user.totpEnabled,
            lastLoginAt: isoOrNull(p.user.lastLoginAt),
            createdAt: p.user.createdAt.toISOString(),
          }
        : null,
      roles: p.roles.map((r) => ({ role: r.role, className: r.class?.name ?? null })),
      enrollments: p.enrollments.map((e) => ({
        className: e.class.name,
        fromDate: iso(e.fromDate),
        toDate: dayOrNull(e.toDate),
      })),
      guardianOf: p.guardianLinks.map((l) => ({
        name: fullName(l.student),
        validFrom: iso(l.validFrom),
        validTo: dayOrNull(l.validTo),
      })),
      guardians: p.studentLinks.map((l) => ({
        name: fullName(l.guardian),
        validFrom: iso(l.validFrom),
        validTo: dayOrNull(l.validTo),
      })),
      attendance: attendance.map((a) => ({
        date: iso(a.occurrence.date),
        subject: a.occurrence.subject.name,
        status: a.status,
        lateMinutes: a.lateMinutes,
      })),
      grades: grades.map((g) => ({
        date: iso(g.assessment.date),
        subject: g.assessment.subject.name,
        kind: g.assessment.kind,
        title: g.assessment.title,
        value: g.value,
        comment: g.comment,
      })),
      consentForms: consentAnswers.map((c) => ({
        title: c.form.title,
        dueOn: dayOrNull(c.form.dueOn),
        student: `${c.student.firstName} ${c.student.lastName}`.trim(),
        answer: c.answer,
        note: c.note,
        answeredAt: c.answeredAt?.toISOString() ?? null,
        onPaper: c.onPaper,
      })),
      remarks: remarks.map((r) => ({
        date: iso(r.occurrence.date),
        subject: r.occurrence.subject.name,
        text: r.text,
        createdAt: r.createdAt.toISOString(),
      })),
      absences: absences.map((a) => ({
        fromAt: a.fromAt.toISOString(),
        toAt: a.toAt.toISOString(),
        status: a.status,
        reasonCode: a.reasonCode,
        reason: a.reason,
        reviewComment: a.reviewComment,
        hasAttachment: a.attachmentId !== null,
      })),
      teacherAbsences: teacherAbsences.map((a) => ({
        fromAt: a.fromAt.toISOString(),
        toAt: a.toAt.toISOString(),
        kind: a.kind,
        note: a.note,
      })),
      messages: messages.map((m) => ({
        thread: m.thread.subject,
        at: m.createdAt.toISOString(),
        body: m.body,
      })),
      announcementsRead: reads.map((r) => ({
        title: r.announcement.title,
        readAt: isoOrNull(r.readAt),
      })),
      notifications: notifications.map((n) => ({
        type: n.type,
        createdAt: n.createdAt.toISOString(),
        readAt: isoOrNull(n.readAt),
      })),
      preferences: prefs
        .filter((x) => x.channel !== '*')
        .map((x) => ({ type: x.type, channel: x.channel, enabled: x.enabled })),
      devices: (p.user?.sessions ?? []).map((s) => ({
        userAgent: s.userAgent,
        lastSeenAt: s.lastSeenAt.toISOString(),
      })),
      consents: consents.map((c) => ({
        kind: c.kind,
        version: c.version,
        acceptedAt: c.acceptedAt.toISOString(),
      })),
      auditTrail: audit.map((a) => ({
        at: a.createdAt.toISOString(),
        action: a.action,
        entity: a.entity,
      })),
    };
  }

  // ───────────── Aufbewahrung ─────────────

  async retentionAllTenants(): Promise<void> {
    const tenants = await this.prisma.client.tenant.findMany({ select: { id: true, slug: true } });
    for (const t of tenants) {
      try {
        const r = await this.prisma.runAsTenant(t.id, (tx) => this.retention(tx, t.id), {
          timeoutMs: 120_000,
        });
        this.logger.log(`Aufbewahrung ${t.slug}: ${JSON.stringify(r)}`);
      } catch (err) {
        this.logger.error(
          `Aufbewahrung ${t.slug}: ${err instanceof Error ? err.message : 'Fehler'}`,
        );
      }
    }
  }

  /**
   * Löscht nach Ablauf der Fristen pro Datentyp (Spec Abschnitt 13). Klassenbuch und Anwesenheit sind
   * Schulunterlagen und bleiben; Personen werden nicht gelöscht, sondern auf Anfrage anonymisiert.
   */
  async retention(tx: Tx, tenantId: string, now = new Date()) {
    const t = await tx.tenant.findUniqueOrThrow({ where: { id: tenantId } });
    const r = tenantSettingsSchema.parse(t.settings).retention;
    const before = (days: number) => new Date(now.getTime() - days * DAY);

    // Nachrichten und Rundschreiben
    const messages = await tx.message.deleteMany({
      where: { createdAt: { lt: before(r.messagesDays) } },
    });
    const threads = await tx.thread.deleteMany({
      where: { lastMessageAt: { lt: before(r.messagesDays) }, messages: { none: {} } },
    });
    const announcements = await tx.announcement.deleteMany({
      where: { publishedAt: { lt: before(r.messagesDays) } },
    });

    // Anhänge (Fotos von Bestätigungen): Datei im Speicher und Verweis entfernen
    const oldFiles = await tx.fileAsset.findMany({
      where: { createdAt: { lt: before(r.attachmentsDays) } },
      select: { id: true, key: true },
    });
    await tx.absence.updateMany({
      where: { attachmentId: { in: oldFiles.map((f) => f.id) } },
      data: { attachmentId: null },
    });
    for (const f of oldFiles) await this.files.removeObject(f.key);
    await tx.fileAsset.deleteMany({ where: { id: { in: oldFiles.map((f) => f.id) } } });

    // Fehlzeiten (samt ihren Anhängen)
    const oldAbsences = await tx.absence.findMany({
      where: { toAt: { lt: before(r.absencesDays) } },
      select: { id: true, attachment: { select: { id: true, key: true } } },
    });
    await tx.absence.deleteMany({ where: { id: { in: oldAbsences.map((a) => a.id) } } });
    for (const a of oldAbsences)
      if (a.attachment) {
        await this.files.removeObject(a.attachment.key);
        await tx.fileAsset.deleteMany({ where: { id: a.attachment.id } });
      }

    const notifications = await tx.notification.deleteMany({
      where: { createdAt: { lt: before(r.notificationsDays) } },
    });
    const remarks = await tx.classbookRemark.deleteMany({
      where: { createdAt: { lt: before(r.remarksDays) } },
    });

    // Audit-Log: sp_app darf nicht löschen; die Datenbankfunktion prüft Mandant und Mindestalter
    const pruned = await tx.$queryRaw<{ n: number }[]>`
      SELECT prune_audit_log(${before(r.auditLogDays)}::timestamptz) AS n`;
    const audit = Number(pruned[0]?.n ?? 0);

    const result = {
      messages: messages.count,
      threads: threads.count,
      announcements: announcements.count,
      attachments: oldFiles.length,
      absences: oldAbsences.length,
      notifications: notifications.count,
      remarks: remarks.count,
      audit,
    };
    if (Object.values(result).some((n) => n > 0))
      await this.audit.record({
        tenantId,
        action: 'retention.run',
        entity: 'tenant',
        entityId: tenantId,
        meta: result,
      });
    return result;
  }
}
