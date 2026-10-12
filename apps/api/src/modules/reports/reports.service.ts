import { Injectable } from '@nestjs/common';
import { Prisma, type Tx } from '@sp/db';
import {
  addDays,
  type AbsenceCounts,
  type AttendanceReport,
  type DashboardMissingEntry,
  type PrincipalDashboard,
  type SubstitutionReport,
  type TimelineItem,
  type TimelineKind,
} from '@sp/shared';
import { DateTime } from 'luxon';
import { fullName } from '../messages/recipients';
import { asDate, iso } from '../timetable/data';

const MISSING_DAYS = 7;
const emptyCounts = (): AbsenceCounts => ({
  open: 0,
  reported: 0,
  excused: 0,
  rejected: 0,
  unexcused: 0,
});
const countKey: Record<string, keyof AbsenceCounts> = {
  OPEN: 'open',
  REPORTED: 'reported',
  EXCUSED: 'excused',
  REJECTED: 'rejected',
  UNEXCUSED: 'unexcused',
};

/** Lagebild (DB-02) und Basis-Auswertungen (DB-03). Nur lesend, alles innerhalb der Anfrage-Transaktion (RLS). */
@Injectable()
export class ReportsService {
  private dayBounds(date: string, tz: string) {
    const start = DateTime.fromISO(date, { zone: tz }).startOf('day');
    return { start: start.toUTC().toJSDate(), end: start.plus({ days: 1 }).toUTC().toJSDate() };
  }

  async dashboard(tx: Tx, tz: string, date: string, now = new Date()): Promise<PrincipalDashboard> {
    const { start, end } = this.dayBounds(date, tz);
    const occurrences = await tx.occurrence.findMany({
      where: { date: asDate(date) },
      orderBy: [{ startsAt: 'asc' }, { id: 'asc' }],
      select: {
        id: true,
        status: true,
        periodStart: true,
        periodCount: true,
        startsAt: true,
        endsAt: true,
        class: { select: { name: true } },
        group: { select: { name: true } },
        subject: { select: { name: true } },
        teachers: { select: { teacher: { select: { firstName: true, lastName: true } } } },
        substitution: { select: { status: true, kind: true } },
        classbook: { select: { closedAt: true } },
      },
    });
    const timeline: TimelineItem[] = [];
    for (const o of occurrences) {
      const sub = o.substitution;
      let kind: TimelineKind | null = null;
      if (sub && sub.status !== 'PUBLISHED') kind = 'open';
      else if (o.status === 'CANCELLED') kind = 'cancelled';
      else if (o.status === 'SUBSTITUTED')
        kind = sub?.kind === 'SUPERVISION' ? 'supervision' : 'substituted';
      else if (o.status === 'ROOM_CHANGED') kind = 'roomChanged';
      else if (o.endsAt < now && !o.classbook?.closedAt) kind = 'missingClassbook';
      if (!kind) continue;
      timeline.push({
        occurrenceId: o.id,
        kind,
        periodStart: o.periodStart,
        periodCount: o.periodCount,
        startsAt: o.startsAt.toISOString(),
        endsAt: o.endsAt.toISOString(),
        className: o.class?.name ?? o.group?.name ?? null,
        subject: o.subject.name,
        teachers: o.teachers.map((t) => fullName(t.teacher)),
      });
    }

    const absences = await tx.teacherAbsence.findMany({
      where: { fromAt: { lt: end }, toAt: { gt: start } },
      orderBy: { fromAt: 'asc' },
      select: {
        id: true,
        kind: true,
        fromAt: true,
        toAt: true,
        teacher: { select: { id: true, firstName: true, lastName: true } },
        substitutions: {
          where: { occurrence: { date: asDate(date) } },
          select: { status: true },
        },
      },
    });

    const missingWhere: Prisma.OccurrenceWhereInput = {
      date: { gte: asDate(addDays(date, -MISSING_DAYS)), lte: asDate(date) },
      endsAt: { lt: now },
      status: { not: 'CANCELLED' },
      OR: [{ classbook: { is: null } }, { classbook: { closedAt: null } }],
    };
    const [missingCount, missingRows] = await Promise.all([
      tx.occurrence.count({ where: missingWhere }),
      tx.occurrence.findMany({
        where: missingWhere,
        orderBy: [{ date: 'desc' }, { startsAt: 'asc' }],
        take: 50,
        select: {
          id: true,
          date: true,
          periodStart: true,
          class: { select: { name: true } },
          group: { select: { name: true } },
          subject: { select: { name: true } },
          teachers: { select: { teacher: { select: { firstName: true, lastName: true } } } },
        },
      }),
    ]);
    const missingClassbook: DashboardMissingEntry[] = missingRows.map((o) => ({
      occurrenceId: o.id,
      date: iso(o.date),
      periodStart: o.periodStart,
      className: o.class?.name ?? o.group?.name ?? null,
      subject: o.subject.name,
      teachers: o.teachers.map((t) => fullName(t.teacher)),
    }));

    const [absentAttendance, absentReported, pendingExcuses] = await Promise.all([
      tx.attendance.findMany({
        where: { status: 'ABSENT', occurrence: { date: asDate(date) } },
        select: { studentId: true },
        distinct: ['studentId'],
      }),
      tx.absence.findMany({
        where: {
          fromAt: { lt: end },
          toAt: { gt: start },
          status: { in: ['OPEN', 'REPORTED', 'EXCUSED'] },
        },
        select: { studentId: true },
        distinct: ['studentId'],
      }),
      tx.absence.count({ where: { status: 'REPORTED' } }),
    ]);
    const studentsAbsent = new Set([
      ...absentAttendance.map((a) => a.studentId),
      ...absentReported.map((a) => a.studentId),
    ]).size;

    return {
      date,
      cards: {
        teachersAbsent: new Set(absences.map((a) => a.teacher.id)).size,
        cancelled: occurrences.filter((o) => o.status === 'CANCELLED').length,
        openSubstitutions: timeline.filter((t) => t.kind === 'open').length,
        missingClassbook: missingCount,
        studentsAbsent,
        pendingExcuses,
      },
      teachersAbsent: absences.map((a) => ({
        id: a.id,
        teacher: { id: a.teacher.id, name: fullName(a.teacher) },
        kind: a.kind,
        fromAt: a.fromAt.toISOString(),
        toAt: a.toAt.toISOString(),
        affected: a.substitutions.length,
        open: a.substitutions.filter((s) => s.status !== 'PUBLISHED').length,
      })),
      missingClassbook,
      timeline,
    };
  }

  /** Anwesenheit je Klasse, mit classId auch je Schüler:in. `classIds` null = alle Klassen des Schuljahres. */
  async attendance(
    tx: Tx,
    tz: string,
    from: string,
    to: string,
    classIds: string[] | null,
    perStudentClassId: string | null,
  ): Promise<AttendanceReport> {
    const classes = await tx.schoolClass.findMany({
      where: classIds ? { id: { in: classIds } } : { schoolYear: { isCurrent: true } },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });
    const ids = classes.map((c) => c.id);
    if (ids.length === 0) return { from, to, classes: [], students: null };
    const range = Prisma.sql`o."date" BETWEEN ${from}::date AND ${to}::date`;
    const inClasses = Prisma.sql`o."classId" IN (${Prisma.join(ids)})`;
    const byStatus = await tx.$queryRaw<{ classId: string; status: string; n: bigint }[]>`
      SELECT o."classId", a."status"::text AS status, count(*) AS n
      FROM "Attendance" a JOIN "Occurrence" o ON o."id" = a."occurrenceId"
      WHERE ${range} AND ${inClasses}
      GROUP BY 1, 2`;
    const lessons = await tx.$queryRaw<{ classId: string; n: bigint }[]>`
      SELECT o."classId", count(DISTINCT o."id") AS n
      FROM "Attendance" a JOIN "Occurrence" o ON o."id" = a."occurrenceId"
      WHERE ${range} AND ${inClasses}
      GROUP BY 1`;

    // Einschreibungen im Zeitraum (Schüler:in → Klasse) für Fehlzeiten und Klassengröße
    const enrollments = await tx.enrollment.findMany({
      where: {
        classId: { in: ids },
        fromDate: { lte: asDate(to) },
        OR: [{ toDate: null }, { toDate: { gte: asDate(from) } }],
      },
      select: { studentId: true, classId: true },
    });
    const classOf = new Map(enrollments.map((e) => [e.studentId, e.classId]));
    const fromAt = DateTime.fromISO(from, { zone: tz }).startOf('day').toUTC().toJSDate();
    const toAt = DateTime.fromISO(to, { zone: tz }).endOf('day').toUTC().toJSDate();
    const absences = await tx.absence.findMany({
      where: {
        studentId: { in: [...classOf.keys()] },
        fromAt: { lte: toAt },
        toAt: { gte: fromAt },
      },
      select: { studentId: true, status: true },
    });

    const rows = classes.map((c) => {
      const stat = (s: string) =>
        Number(byStatus.find((r) => r.classId === c.id && r.status === s)?.n ?? 0);
      const counts = emptyCounts();
      for (const a of absences)
        if (classOf.get(a.studentId) === c.id) counts[countKey[a.status]!]++;
      return {
        classId: c.id,
        className: c.name,
        students: new Set(enrollments.filter((e) => e.classId === c.id).map((e) => e.studentId))
          .size,
        lessons: Number(lessons.find((l) => l.classId === c.id)?.n ?? 0),
        absentLessons: stat('ABSENT'),
        lateLessons: stat('LATE'),
        absences: counts,
      };
    });

    let students: AttendanceReport['students'] = null;
    if (perStudentClassId) {
      const per = await tx.$queryRaw<
        { studentId: string; status: string; n: bigint; minutes: bigint | null }[]
      >`
        SELECT a."studentId", a."status"::text AS status, count(*) AS n, sum(a."lateMinutes") AS minutes
        FROM "Attendance" a JOIN "Occurrence" o ON o."id" = a."occurrenceId"
        WHERE ${range} AND o."classId" = ${perStudentClassId}
        GROUP BY 1, 2`;
      const ids2 = enrollments
        .filter((e) => e.classId === perStudentClassId)
        .map((e) => e.studentId);
      const people = await tx.person.findMany({
        where: { id: { in: ids2 } },
        select: { id: true, firstName: true, lastName: true },
        orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      });
      students = people.map((p) => {
        const late = per.find((r) => r.studentId === p.id && r.status === 'LATE');
        const counts = emptyCounts();
        for (const a of absences) if (a.studentId === p.id) counts[countKey[a.status]!]++;
        return {
          studentId: p.id,
          name: `${p.lastName} ${p.firstName}`.trim(),
          absentLessons: Number(
            per.find((r) => r.studentId === p.id && r.status === 'ABSENT')?.n ?? 0,
          ),
          lateLessons: Number(late?.n ?? 0),
          lateMinutes: Number(late?.minutes ?? 0),
          absences: counts,
        };
      });
    }
    return { from, to, classes: rows, students };
  }

  /** Supplierstunden je Lehrkraft und Summen (nur veröffentlichte Änderungen). */
  async substitutions(tx: Tx, from: string, to: string): Promise<SubstitutionReport> {
    const subs = await tx.substitution.findMany({
      where: {
        status: 'PUBLISHED',
        occurrence: { date: { gte: asDate(from), lte: asDate(to) } },
      },
      select: {
        kind: true,
        substituteTeacherId: true,
        occurrence: { select: { periodCount: true } },
        teacherAbsence: { select: { teacherId: true } },
      },
    });
    const per = new Map<string, { substituted: number; supervised: number; missed: number }>();
    const row = (id: string) => {
      const r = per.get(id) ?? { substituted: 0, supervised: 0, missed: 0 };
      per.set(id, r);
      return r;
    };
    const totals = { substitutions: 0, supervisions: 0, cancelled: 0, roomChanges: 0 };
    for (const s of subs) {
      const hours = s.occurrence.periodCount;
      if (s.kind === 'SUBSTITUTE') totals.substitutions += hours;
      if (s.kind === 'SUPERVISION') totals.supervisions += hours;
      if (s.kind === 'CANCEL') totals.cancelled += hours;
      if (s.kind === 'ROOM_CHANGE') totals.roomChanges += hours;
      if (s.substituteTeacherId && s.kind === 'SUBSTITUTE')
        row(s.substituteTeacherId).substituted += hours;
      if (s.substituteTeacherId && s.kind === 'SUPERVISION')
        row(s.substituteTeacherId).supervised += hours;
      if (
        s.teacherAbsence &&
        (s.kind === 'SUBSTITUTE' || s.kind === 'SUPERVISION' || s.kind === 'CANCEL')
      )
        row(s.teacherAbsence.teacherId).missed += hours;
    }
    const people = await tx.person.findMany({
      where: { id: { in: [...per.keys()] } },
      select: { id: true, firstName: true, lastName: true },
    });
    const name = new Map(people.map((p) => [p.id, `${p.lastName} ${p.firstName}`.trim()]));
    return {
      from,
      to,
      totals,
      teachers: [...per.entries()]
        .map(([teacherId, r]) => ({ teacherId, name: name.get(teacherId) ?? '–', ...r }))
        .sort((a, b) => a.name.localeCompare(b.name, 'de')),
    };
  }
}
