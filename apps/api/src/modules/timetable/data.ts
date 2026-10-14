import type { Prisma, Tx } from '@sp/db';
import {
  checkConstraints,
  tenantSettingsSchema,
  validateTimetable,
  type Conflict,
  type LessonRule,
  type PeriodInfo,
  type PlanningConstraint,
  type ValidationContext,
} from '@sp/shared';
import { DateTime } from 'luxon';

export const lessonInclude = {
  teachers: { select: { teacherId: true } },
} satisfies Prisma.LessonInclude;
type LessonRow = Prisma.LessonGetPayload<{ include: typeof lessonInclude }>;

export const iso = (d: Date): string => d.toISOString().slice(0, 10);
export const asDate = (s: string): Date => new Date(`${s}T00:00:00.000Z`);

/** Heutiges Datum in der Zeitzone der Schule (Europe/Vienna), nicht in UTC. */
export function todayIn(timezone: string): string {
  return DateTime.now().setZone(timezone).toISODate()!;
}

export function toRule(l: LessonRow): LessonRule & { version: number; pinned: boolean } {
  return {
    id: l.id,
    weekday: l.weekday,
    periodStart: l.periodStart,
    periodCount: l.periodCount,
    weekPattern: l.weekPattern,
    subjectId: l.subjectId,
    classId: l.classId,
    groupId: l.groupId,
    roomId: l.roomId,
    teacherIds: l.teachers.map((t) => t.teacherId).sort(),
    version: l.version,
    pinned: l.pinned,
  };
}

export async function loadRules(tx: Tx, versionId: string) {
  const rows = await tx.lesson.findMany({
    where: { versionId },
    include: lessonInclude,
    orderBy: [{ weekday: 'asc' }, { periodStart: 'asc' }, { id: 'asc' }],
  });
  return rows.map(toRule);
}

export async function loadPeriods(tx: Tx): Promise<PeriodInfo[]> {
  return tx.period.findMany({
    orderBy: { number: 'asc' },
    select: { number: true, startTime: true, endTime: true, blocksDouble: true },
  });
}

/** Schülerlisten je Klasse/Gruppe des Schuljahres und Raumkapazitäten: Grundlage für STUDENT_DOUBLE und ROOM_CAPACITY. */
export async function loadValidationContext(
  tx: Tx,
  schoolYearId: string,
  onDate: string,
): Promise<ValidationContext> {
  const day = asDate(onDate);
  const [periods, enrollments, members, rooms] = await Promise.all([
    loadPeriods(tx),
    tx.enrollment.findMany({
      where: {
        class: { schoolYearId },
        fromDate: { lte: day },
        OR: [{ toDate: null }, { toDate: { gte: day } }],
      },
      select: { classId: true, studentId: true },
    }),
    tx.groupMember.findMany({
      where: { group: { schoolYearId } },
      select: { groupId: true, studentId: true },
    }),
    tx.room.findMany({ select: { id: true, capacity: true } }),
  ]);
  const classStudents: Record<string, string[]> = {};
  for (const e of enrollments) (classStudents[e.classId] ??= []).push(e.studentId);
  const groupMembers: Record<string, string[]> = {};
  for (const m of members) (groupMembers[m.groupId] ??= []).push(m.studentId);
  return {
    periods,
    classStudents,
    groupMembers,
    roomCapacity: Object.fromEntries(rooms.map((r) => [r.id, r.capacity])),
  };
}

/** Aktive Planungswünsche des Schuljahres (M7). */
export async function loadPlanningConstraints(
  tx: Tx,
  schoolYearId: string,
): Promise<PlanningConstraint[]> {
  const rows = await tx.planningConstraint.findMany({ where: { schoolYearId, active: true } });
  return rows.map((r) => ({
    id: r.id,
    kind: r.kind,
    hard: r.hard,
    active: r.active,
    teacherId: r.teacherId,
    classId: r.classId,
    subjectId: r.subjectId,
    roomIds: r.roomIds,
    weekday: r.weekday,
    periods: r.periods,
    max: r.max,
    source: r.source,
    text: r.text,
  }));
}

/** Tagesbelastung aus den Schuleinstellungen und aktive Wünsche: Zusatz zum Prüfkontext des Editors. */
export async function loadEditorRules(tx: Tx, tenantId: string, schoolYearId: string) {
  const [tenant, constraints] = await Promise.all([
    tx.tenant.findUniqueOrThrow({ where: { id: tenantId }, select: { settings: true } }),
    loadPlanningConstraints(tx, schoolYearId),
  ]);
  return {
    soft: { dayLoadMax: tenantSettingsSchema.parse(tenant.settings).timetable.dayLoadMax },
    constraints,
  };
}

/**
 * Vollständige Prüfung für Editor und Veröffentlichung: harte Regeln (Spec Abschnitt 10), weiche Regeln (SP-06,
 * Tagesbelastung aus den Schuleinstellungen) und Planungswünsche. Wünsche sind im Editor Warnungen: Der Solver
 * hält harte Wünsche ein, eine Hand-Korrektur darf bewusst abweichen (ADR 0012).
 */
export async function fullConflicts(
  tx: Tx,
  tenantId: string,
  schoolYearId: string,
  lessons: LessonRule[],
  ctx: ValidationContext,
  change?: { lesson: LessonRule },
): Promise<Conflict[]> {
  const { soft, constraints } = await loadEditorRules(tx, tenantId, schoolYearId);
  const all = change
    ? [...lessons.filter((l) => l.id !== change.lesson.id), change.lesson]
    : lessons;
  const wishes = checkConstraints(all, constraints).map((c) => ({
    ...c,
    severity: 'soft' as const,
  }));
  const result = [
    ...validateTimetable(lessons, { ...ctx, soft }, change),
    ...(change ? wishes.filter((c) => c.lessonIds.includes(change.lesson.id)) : wishes),
  ];
  return result;
}
