import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import type { Tx } from '@sp/db';
import {
  absenceWarnings,
  tenantSettingsSchema,
  type AbsenceStatusName,
  type AbsenceWarningItem,
} from '@sp/shared';
import { QueueService } from '../jobs/queue.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { asDate, iso, todayIn } from '../timetable/data';

export const QUEUE_ABSENCE_WARNINGS = 'absence-warnings-daily';
const DAY = 86_400_000;

/**
 * Frühwarnung bei Häufung von Fehlzeiten (AB-05). Zählung als reine Funktion in @sp/shared (absenceWarnings);
 * hier Laden der Daten, Abfrage für Klassenvorstand und Direktion und der tägliche Hinweis an den Klassenvorstand.
 */
@Injectable()
export class AbsenceWarningsService implements OnModuleInit {
  private readonly logger = new Logger(AbsenceWarningsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly queue: QueueService,
    private readonly notifications: NotificationsService,
  ) {}

  onModuleInit(): void {
    this.queue.register(QUEUE_ABSENCE_WARNINGS, () => this.dailyAllTenants(), {
      cron: '0 13 * * 1-5',
    });
  }

  /** Warnungen im laufenden Schuljahr, für bestimmte Klassen oder (null) die ganze Schule. */
  async list(
    tx: Tx,
    tenantId: string,
    classIds: string[] | null,
  ): Promise<{ schoolYearId: string | null; data: AbsenceWarningItem[] }> {
    const t = await tx.tenant.findUniqueOrThrow({ where: { id: tenantId } });
    const s = tenantSettingsSchema.parse(t.settings).absence;
    const today = todayIn(t.timezone);
    const year = await tx.schoolYear.findFirst({
      where: { isCurrent: true },
      select: { id: true, startsOn: true },
    });
    if (!year) return { schoolYearId: null, data: [] };
    const enrollments = await tx.enrollment.findMany({
      where: {
        ...(classIds ? { classId: { in: classIds } } : { class: { schoolYearId: year.id } }),
        fromDate: { lte: asDate(today) },
        OR: [{ toDate: null }, { toDate: { gte: asDate(today) } }],
        student: { anonymizedAt: null },
      },
      select: {
        studentId: true,
        class: { select: { id: true, name: true } },
        student: { select: { firstName: true, lastName: true } },
      },
    });
    const ids = enrollments.map((e) => e.studentId);
    if (ids.length === 0) return { schoolYearId: year.id, data: [] };
    const yearStart = iso(year.startsOn);
    const [lessons, absences] = await Promise.all([
      tx.attendance.findMany({
        where: {
          studentId: { in: ids },
          status: 'ABSENT',
          occurrence: {
            date: { gte: year.startsOn, lte: asDate(today) },
            status: { not: 'CANCELLED' },
          },
        },
        select: { studentId: true, occurrence: { select: { date: true, startsAt: true } } },
      }),
      tx.absence.findMany({
        where: { studentId: { in: ids }, toAt: { gte: year.startsOn } },
        select: { studentId: true, fromAt: true, toAt: true, status: true },
      }),
    ]);
    const warnings = absenceWarnings(
      lessons.map((l) => ({
        studentId: l.studentId,
        date: iso(l.occurrence.date),
        startsAt: l.occurrence.startsAt,
      })),
      absences.map((a) => ({ ...a, status: a.status as AbsenceStatusName })),
      {
        today,
        yearStart,
        warnUnexcusedLessons: s.warnUnexcusedLessons,
        warnLessons: s.warnLessons,
        warnWindowDays: s.warnWindowDays,
      },
    );
    const byStudent = new Map(enrollments.map((e) => [e.studentId, e]));
    return {
      schoolYearId: year.id,
      data: warnings.map((w) => {
        const e = byStudent.get(w.studentId)!;
        return {
          ...w,
          name: `${e.student.lastName} ${e.student.firstName}`.trim(),
          classId: e.class.id,
          className: e.class.name,
        };
      }),
    };
  }

  async dailyAllTenants(): Promise<void> {
    const tenants = await this.prisma.client.tenant.findMany({ select: { id: true, slug: true } });
    for (const t of tenants) {
      try {
        await this.prisma.runAsTenant(t.id, (tx) => this.notifyNew(tx, t.id));
      } catch (err) {
        this.logger.error(`Frühwarnung ${t.slug}: ${err instanceof Error ? err.message : ''}`);
      }
    }
  }

  /**
   * Hinweis an den Klassenvorstand (ohne Namen) für neu überschrittene Schwellen. "Unentschuldigt" kommt einmal je
   * Schuljahr, "häufig" erneut, wenn die letzte Warnung länger als das Beobachtungsfenster zurückliegt.
   */
  async notifyNew(tx: Tx, tenantId: string, now = new Date()): Promise<number> {
    const { schoolYearId, data } = await this.list(tx, tenantId, null);
    if (!schoolYearId || data.length === 0) return 0;
    const t = await tx.tenant.findUniqueOrThrow({ where: { id: tenantId } });
    const windowDays = tenantSettingsSchema.parse(t.settings).absence.warnWindowDays;
    const known = await tx.absenceWarning.findMany({
      where: { schoolYearId, studentId: { in: data.map((w) => w.studentId) } },
    });
    const homeroom = await tx.roleAssignment.findMany({
      where: { role: 'HOMEROOM', classId: { in: [...new Set(data.map((w) => w.classId))] } },
      select: { personId: true, classId: true },
    });
    let sent = 0;
    for (const w of data) {
      const fresh = w.kinds.filter((kind) => {
        const k = known.find((x) => x.studentId === w.studentId && x.kind === kind);
        if (!k) return true;
        return kind === 'FREQUENT' && now.getTime() - k.notifiedAt.getTime() > windowDays * DAY;
      });
      if (fresh.length === 0) continue;
      for (const kind of fresh)
        await tx.absenceWarning.upsert({
          where: {
            studentId_schoolYearId_kind: { studentId: w.studentId, schoolYearId, kind },
          },
          create: { tenantId, studentId: w.studentId, schoolYearId, kind, notifiedAt: now },
          update: { notifiedAt: now },
        });
      const to = homeroom.filter((h) => h.classId === w.classId).map((h) => h.personId);
      await this.notifications.emit(tx, tenantId, 'absence.warning', to, {
        params: { className: w.className },
        url: `/klasse/${w.classId}/fehlzeiten`,
      });
      sent++;
    }
    return sent;
  }
}
