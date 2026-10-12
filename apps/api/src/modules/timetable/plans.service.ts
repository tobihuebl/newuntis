import { ForbiddenException, Injectable } from '@nestjs/common';
import type { Prisma, Tx } from '@sp/db';
import { addDays, mondayOf, type PlanEntry, type PlanResponse, type Role } from '@sp/shared';
import type { Principal } from '../../common/request';
import { bad } from '../admin/util';
import { PolicyService } from '../policy/policy.service';
import { asDate, iso, loadPeriods, todayIn } from './data';
import { OccurrencesService, WINDOW_DAYS } from './occurrences.service';

/** Welche Termine gehören in einen Plan (ODER-verknüpft). */
export interface PlanFilter {
  classIds: string[];
  groupIds: string[];
  teacherIds: string[];
  roomIds: string[];
}
const emptyFilter = (): PlanFilter => ({ classIds: [], groupIds: [], teacherIds: [], roomIds: [] });
const MAX_DAYS = 62;
const TEACHING_ROLES: Role[] = ['TEACHER', 'HOMEROOM', 'PRINCIPAL', 'ADMIN'];

@Injectable()
export class PlansService {
  constructor(
    private readonly occurrences: OccurrencesService,
    private readonly policy: PolicyService,
  ) {}

  /** Standard: die laufende Woche (Mo bis Fr) in der Zeitzone der Schule. */
  async range(
    tx: Tx,
    tenantId: string,
    from?: string,
    to?: string,
  ): Promise<{ from: string; to: string; timezone: string }> {
    const timezone = (
      await tx.tenant.findUniqueOrThrow({ where: { id: tenantId }, select: { timezone: true } })
    ).timezone;
    const start = from ?? mondayOf(todayIn(timezone));
    const end = to ?? addDays(start, 4);
    if ((Date.parse(end) - Date.parse(start)) / 86_400_000 > MAX_DAYS)
      bad(`Höchstens ${MAX_DAYS} Tage auf einmal`);
    return { from: start, to: end, timezone };
  }

  /** Klassen und Gruppen einer Schüler:in zu einem Stichtag. */
  async studentFilter(tx: Tx, studentId: string, onDate: string): Promise<PlanFilter> {
    const day = asDate(onDate);
    const [enrollments, groups] = await Promise.all([
      tx.enrollment.findMany({
        where: {
          studentId,
          fromDate: { lte: day },
          OR: [{ toDate: null }, { toDate: { gte: day } }],
        },
        select: { classId: true },
      }),
      tx.groupMember.findMany({ where: { studentId }, select: { groupId: true } }),
    ]);
    return {
      ...emptyFilter(),
      classIds: enrollments.map((e) => e.classId),
      groupIds: groups.map((g) => g.groupId),
    };
  }

  /**
   * Eigener Plan (timetable.read.own): Schüler:innen sehen ihre Klasse und Gruppen, Lehrkräfte ihre Stunden,
   * Eltern den Plan eines verknüpften Kindes (`studentId`, bei nur einem Kind optional).
   */
  async ownFilter(
    tx: Tx,
    tenantId: string,
    me: Principal,
    onDate: string,
    studentId?: string,
  ): Promise<PlanFilter> {
    const roles = me.roles.map((r) => r.role);
    if (studentId && studentId !== me.personId) {
      if (!(await this.policy.can(tenantId, me, 'timetable.read.own', { studentId })))
        throw new ForbiddenException({ title: 'Keine Berechtigung für diesen Plan' });
      return this.studentFilter(tx, studentId, onDate);
    }
    if (roles.includes('STUDENT')) return this.studentFilter(tx, me.personId, onDate);
    if (roles.some((r) => TEACHING_ROLES.includes(r)))
      return { ...emptyFilter(), teacherIds: [me.personId] };
    if (roles.includes('GUARDIAN')) {
      const children = await this.children(tx, me.personId, onDate);
      if (children.length === 1) return this.studentFilter(tx, children[0]!.id, onDate);
      if (children.length === 0) return emptyFilter();
      bad('Bitte ein Kind wählen (studentId)');
    }
    return emptyFilter();
  }

  async children(tx: Tx, guardianId: string, onDate: string) {
    const day = asDate(onDate);
    const links = await tx.guardianLink.findMany({
      where: {
        guardianId,
        validFrom: { lte: day },
        OR: [{ validTo: null }, { validTo: { gte: day } }],
        student: { anonymizedAt: null },
      },
      include: {
        student: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            enrollments: {
              where: { fromDate: { lte: day }, OR: [{ toDate: null }, { toDate: { gte: day } }] },
              select: { class: { select: { name: true } } },
            },
          },
        },
      },
      orderBy: { student: { firstName: 'asc' } },
    });
    return links.map((l) => ({
      id: l.student.id,
      firstName: l.student.firstName,
      lastName: l.student.lastName,
      className: l.student.enrollments[0]?.class.name ?? null,
    }));
  }

  /** Vereinigung der Pläne aller Kinder (für den Kalender-Feed von Eltern). */
  async childrenFilter(tx: Tx, guardianId: string, onDate: string): Promise<PlanFilter> {
    const out = emptyFilter();
    for (const c of await this.children(tx, guardianId, onDate)) {
      const f = await this.studentFilter(tx, c.id, onDate);
      out.classIds.push(...f.classIds);
      out.groupIds.push(...f.groupIds);
    }
    return out;
  }

  /**
   * Einträge eines Zeitraums: bis zum Ende des erzeugten Fensters aus den Terminen (mit Änderungen wie Entfall),
   * danach aus den Regeln der gültigen Version ("geplant").
   */
  async plan(
    tx: Tx,
    tenantId: string,
    filter: PlanFilter,
    from: string,
    to: string,
    timezone: string,
  ): Promise<PlanResponse> {
    const periods = (await loadPeriods(tx)).map(({ number, startTime, endTime }) => ({
      number,
      startTime,
      endTime,
    }));
    const empty =
      filter.classIds.length +
        filter.groupIds.length +
        filter.teacherIds.length +
        filter.roomIds.length ===
      0;
    if (empty) return { from, to, periods, entries: [] };
    const windowEnd = addDays(todayIn(timezone), WINDOW_DAYS);
    const or: Prisma.OccurrenceWhereInput[] = [];
    if (filter.classIds.length) or.push({ classId: { in: filter.classIds } });
    if (filter.groupIds.length) or.push({ groupId: { in: filter.groupIds } });
    if (filter.teacherIds.length)
      or.push({ teachers: { some: { teacherId: { in: filter.teacherIds } } } });
    if (filter.roomIds.length) or.push({ roomId: { in: filter.roomIds } });

    type Raw = {
      id: string;
      planned: boolean;
      date: string;
      periodStart: number;
      periodCount: number;
      startsAt: Date;
      endsAt: Date;
      status: PlanEntry['status'];
      subjectId: string;
      classId: string | null;
      groupId: string | null;
      roomId: string | null;
      teacherIds: string[];
    };
    const raw: Raw[] = [];
    const dbTo = to < windowEnd ? to : windowEnd;
    if (from <= dbTo) {
      const rows = await tx.occurrence.findMany({
        where: { date: { gte: asDate(from), lte: asDate(dbTo) }, OR: or },
        include: { teachers: { select: { teacherId: true } } },
      });
      raw.push(
        ...rows.map((o) => ({
          id: o.id,
          planned: false,
          date: iso(o.date),
          periodStart: o.periodStart,
          periodCount: o.periodCount,
          startsAt: o.startsAt,
          endsAt: o.endsAt,
          status: o.status,
          subjectId: o.subjectId,
          classId: o.classId,
          groupId: o.groupId,
          roomId: o.roomId,
          teacherIds: o.teachers.map((t) => t.teacherId),
        })),
      );
    }
    const planFrom = from > windowEnd ? from : addDays(windowEnd, 1);
    if (planFrom <= to) {
      const matches = (p: {
        classId: string | null;
        groupId: string | null;
        roomId: string | null;
        teacherIds: string[];
      }) =>
        (p.classId !== null && filter.classIds.includes(p.classId)) ||
        (p.groupId !== null && filter.groupIds.includes(p.groupId)) ||
        (p.roomId !== null && filter.roomIds.includes(p.roomId)) ||
        p.teacherIds.some((t) => filter.teacherIds.includes(t));
      for (const p of await this.occurrences.plannedRange(tx, tenantId, planFrom, to)) {
        if (matches(p))
          raw.push({
            ...p,
            id: `plan:${p.lessonId}:${p.date}`,
            planned: true,
            status: 'SCHEDULED',
          });
      }
    }

    const ids = (pick: (r: Raw) => (string | null)[]) => [
      ...new Set(raw.flatMap(pick).filter((x): x is string => x !== null)),
    ];
    const [subjects, classes, groups, rooms, teachers] = await Promise.all([
      tx.subject.findMany({
        where: { id: { in: ids((r) => [r.subjectId]) } },
        select: { id: true, name: true, code: true, color: true },
      }),
      tx.schoolClass.findMany({
        where: { id: { in: ids((r) => [r.classId]) } },
        select: { id: true, name: true },
      }),
      tx.group.findMany({
        where: { id: { in: ids((r) => [r.groupId]) } },
        select: { id: true, name: true },
      }),
      tx.room.findMany({
        where: { id: { in: ids((r) => [r.roomId]) } },
        select: { id: true, name: true },
      }),
      tx.person.findMany({
        where: { id: { in: ids((r) => r.teacherIds) } },
        select: { id: true, firstName: true, lastName: true },
      }),
    ]);
    const byId = <T extends { id: string }>(xs: T[]) => new Map(xs.map((x) => [x.id, x]));
    const S = byId(subjects);
    const C = byId(classes);
    const G = byId(groups);
    const R = byId(rooms);
    const T = byId(teachers);
    const entries: PlanEntry[] = raw
      .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime() || a.periodStart - b.periodStart)
      .map((r) => ({
        id: r.id,
        planned: r.planned,
        date: r.date,
        periodStart: r.periodStart,
        periodCount: r.periodCount,
        startsAt: r.startsAt.toISOString(),
        endsAt: r.endsAt.toISOString(),
        status: r.status,
        subject: S.get(r.subjectId) ?? { id: r.subjectId, name: '?', code: '?', color: null },
        class: r.classId ? (C.get(r.classId) ?? null) : null,
        group: r.groupId ? (G.get(r.groupId) ?? null) : null,
        room: r.roomId ? (R.get(r.roomId) ?? null) : null,
        teachers: r.teacherIds
          .map((id) => T.get(id))
          .filter((t) => t !== undefined)
          .map((t) => ({ id: t.id, name: `${t.firstName} ${t.lastName}` })),
      }));
    return { from, to, periods, entries };
  }
}
