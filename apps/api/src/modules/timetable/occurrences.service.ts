import { randomUUID } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import type { Tx } from '@sp/db';
import {
  addDays,
  mondayOf,
  planDay,
  tenantSettingsSchema,
  type PlannedOccurrence,
} from '@sp/shared';
import { PrismaService } from '../prisma/prisma.service';
import { asDate, iso, lessonInclude, loadPeriods, toRule, todayIn } from './data';

/** Gleitendes Fenster der erzeugten Termine (Spec Abschnitt 10: heute bis heute + 28 Tage). */
export const WINDOW_DAYS = 28;

export interface GenerateResult {
  created: number;
  updated: number;
  deleted: number;
  kept: number;
}

@Injectable()
export class OccurrencesService {
  private readonly logger = new Logger(OccurrencesService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Geplante Termine für einen Zeitraum aus den veröffentlichten Versionen.
   * Für jeden Tag gilt die Version mit dem spätesten Veröffentlichungszeitpunkt, deren "gültig ab" erreicht ist
   * und deren Schuljahr den Tag enthält. Archivierte Versionen gelten so weiter für die Tage vor ihrer Nachfolgerin.
   */
  async plannedRange(
    tx: Tx,
    tenantId: string,
    from: string,
    to: string,
  ): Promise<PlannedOccurrence[]> {
    const tenant = await tx.tenant.findUniqueOrThrow({ where: { id: tenantId } });
    const settings = tenantSettingsSchema.parse(tenant.settings);
    const versions = await tx.timetableVersion.findMany({
      where: { status: { in: ['PUBLISHED', 'ARCHIVED'] }, publishedAt: { not: null } },
      include: { schoolYear: { include: { freeDays: true } }, lessons: { include: lessonInclude } },
      orderBy: { publishedAt: 'desc' },
    });
    if (versions.length === 0) return [];
    const periods = await loadPeriods(tx);
    const prepared = versions.map((v) => ({
      validFrom: iso(v.validFrom),
      startsOn: iso(v.schoolYear.startsOn),
      endsOn: iso(v.schoolYear.endsOn),
      lessons: v.lessons.map(toRule),
      freeDays: v.schoolYear.freeDays.map((f) => ({
        fromDate: iso(f.fromDate),
        toDate: iso(f.toDate),
      })),
      referenceMonday: settings.abWeekReferenceMonday ?? mondayOf(iso(v.schoolYear.startsOn)),
    }));
    const out: PlannedOccurrence[] = [];
    for (let d = from; d <= to; d = addDays(d, 1)) {
      const v = prepared.find((p) => p.validFrom <= d && p.startsOn <= d && d <= p.endsOn);
      if (v)
        out.push(
          ...planDay(d, {
            lessons: v.lessons,
            periods,
            freeDays: v.freeDays,
            referenceMonday: v.referenceMonday,
            timezone: tenant.timezone,
          }),
        );
    }
    return out;
  }

  /**
   * Gleicht die Termine im Zeitraum mit dem Plan ab (idempotent): legt fehlende an, passt geänderte an, löscht entfallene.
   * Termine mit Klassenbuch, Anwesenheit oder Supplierung werden nie verändert oder gelöscht.
   */
  async generate(tx: Tx, tenantId: string, from: string, to: string): Promise<GenerateResult> {
    const planned = await this.plannedRange(tx, tenantId, from, to);
    const existing = await tx.occurrence.findMany({
      where: { date: { gte: asDate(from), lte: asDate(to) }, lessonId: { not: null } },
      include: {
        teachers: { select: { teacherId: true } },
        classbook: { select: { id: true } },
        substitution: { select: { id: true } },
        _count: { select: { attendances: true, remarks: true } },
      },
    });
    const touched = (o: (typeof existing)[number]) =>
      o.classbook !== null ||
      o.substitution !== null ||
      o._count.attendances > 0 ||
      o._count.remarks > 0 ||
      o.status !== 'SCHEDULED';
    const key = (lessonId: string, date: string) => `${lessonId}|${date}`;
    const byKey = new Map(existing.map((o) => [key(o.lessonId!, iso(o.date)), o]));
    const wanted = new Map(planned.map((p) => [key(p.lessonId, p.date), p]));
    const result: GenerateResult = { created: 0, updated: 0, deleted: 0, kept: 0 };

    const stale = existing.filter((o) => !wanted.has(key(o.lessonId!, iso(o.date))));
    const deletable = stale.filter((o) => !touched(o)).map((o) => o.id);
    result.kept += stale.length - deletable.length;
    if (deletable.length)
      result.deleted = (await tx.occurrence.deleteMany({ where: { id: { in: deletable } } })).count;

    const creates: { id: string; p: PlannedOccurrence }[] = [];
    for (const p of planned) {
      const o = byKey.get(key(p.lessonId, p.date));
      if (!o) {
        creates.push({ id: randomUUID(), p });
        continue;
      }
      if (touched(o)) {
        result.kept++;
        continue;
      }
      const teachers = o.teachers.map((t) => t.teacherId).sort();
      const same =
        o.periodStart === p.periodStart &&
        o.periodCount === p.periodCount &&
        o.startsAt.getTime() === p.startsAt.getTime() &&
        o.endsAt.getTime() === p.endsAt.getTime() &&
        o.subjectId === p.subjectId &&
        o.classId === p.classId &&
        o.groupId === p.groupId &&
        o.roomId === p.roomId &&
        teachers.join(',') === [...p.teacherIds].sort().join(',');
      if (same) continue;
      await tx.occurrence.update({
        where: { id: o.id },
        data: {
          periodStart: p.periodStart,
          periodCount: p.periodCount,
          startsAt: p.startsAt,
          endsAt: p.endsAt,
          subjectId: p.subjectId,
          classId: p.classId,
          groupId: p.groupId,
          roomId: p.roomId,
        },
      });
      await tx.occurrenceTeacher.deleteMany({ where: { occurrenceId: o.id } });
      if (p.teacherIds.length)
        await tx.occurrenceTeacher.createMany({
          data: p.teacherIds.map((teacherId) => ({ tenantId, occurrenceId: o.id, teacherId })),
        });
      result.updated++;
    }
    if (creates.length) {
      await tx.occurrence.createMany({
        data: creates.map(({ id, p }) => ({
          id,
          tenantId,
          lessonId: p.lessonId,
          date: asDate(p.date),
          periodStart: p.periodStart,
          periodCount: p.periodCount,
          startsAt: p.startsAt,
          endsAt: p.endsAt,
          subjectId: p.subjectId,
          classId: p.classId,
          groupId: p.groupId,
          roomId: p.roomId,
        })),
      });
      const teacherRows = creates.flatMap(({ id, p }) =>
        p.teacherIds.map((teacherId) => ({ tenantId, occurrenceId: id, teacherId })),
      );
      if (teacherRows.length) await tx.occurrenceTeacher.createMany({ data: teacherRows });
      result.created = creates.length;
    }
    return result;
  }

  /** Fenster heute (Zeitzone der Schule) bis heute + 28 Tage. */
  async generateWindow(tx: Tx, tenantId: string): Promise<GenerateResult> {
    const tenant = await tx.tenant.findUniqueOrThrow({
      where: { id: tenantId },
      select: { timezone: true },
    });
    const from = todayIn(tenant.timezone);
    return this.generate(tx, tenantId, from, addDays(from, WINDOW_DAYS));
  }

  /** Nächtlicher Lauf über alle Schulen; jede Schule in eigener Transaktion mit Row-Level-Security. */
  async generateAllTenants(): Promise<void> {
    const tenants = await this.prisma.client.tenant.findMany({ select: { id: true, slug: true } });
    for (const t of tenants) {
      try {
        const r = await this.prisma.runAsTenant(t.id, (tx) => this.generateWindow(tx, t.id), {
          timeoutMs: 120_000,
        });
        this.logger.log(
          `Termine ${t.slug}: +${r.created} ~${r.updated} -${r.deleted} (=${r.kept} unverändert geschützt)`,
        );
      } catch (err) {
        this.logger.error(
          `Termine ${t.slug} fehlgeschlagen: ${err instanceof Error ? err.message : 'unbekannt'}`,
        );
      }
    }
  }
}
