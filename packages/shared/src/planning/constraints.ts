/**
 * Planungswünsche (M7, ADR 0012): sichtbare, prüfbare Regeln für den Stundenplan-Assistenten. Ein Wunsch ist hart
 * (der Solver verletzt ihn nie) oder weich (der Solver vermeidet Verstöße, die Prüfung warnt).
 */
import { z } from 'zod';
import type { Conflict, LessonRule } from '../timetable';

export const CONSTRAINT_KINDS = [
  /** Lehrkraft an einem Tag nicht verfügbar; ohne Stunden = ganzer Tag (freier Tag). */
  'TEACHER_UNAVAILABLE',
  /** Höchstens so viele Stunden je Tag für eine Lehrkraft. */
  'TEACHER_MAX_PER_DAY',
  /** Höchstens so viele Stunden je Tag für eine Klasse (ohne Klasse: alle Klassen). */
  'CLASS_MAX_PER_DAY',
  /** Fach nur in diesen Räumen (Fachräume, Turnsaal). */
  'SUBJECT_ROOMS',
  /** Stammraum einer Klasse für Stunden ohne Fachraum. */
  'CLASS_HOME_ROOM',
  /** Fach nicht in diesen Stunden (ohne Wochentag: an allen Tagen). */
  'SUBJECT_NOT_PERIODS',
  /** Hohlstunden für Schüler:innen vermeiden (hart: so gut wie ausgeschlossen). */
  'NO_STUDENT_GAPS',
] as const;
export type ConstraintKind = (typeof CONSTRAINT_KINDS)[number];

export const CONSTRAINT_SOURCES = ['FORM', 'TEXT', 'AI'] as const;
export type ConstraintSource = (typeof CONSTRAINT_SOURCES)[number];

export interface PlanningConstraint {
  id: string;
  kind: ConstraintKind;
  hard: boolean;
  active: boolean;
  teacherId: string | null;
  classId: string | null;
  subjectId: string | null;
  roomIds: string[];
  weekday: number | null;
  periods: number[];
  max: number | null;
  source: ConstraintSource;
  /** Ursprünglicher Satz, wenn der Wunsch aus Worten entstanden ist. */
  text: string | null;
}

const id = z.string().min(1);
const weekday = z.number().int().min(1).max(5);
const periods = z.array(z.number().int().min(1).max(20)).max(20);

/** Eingabe (Formular, Übersetzer, KI); Pflichtfelder hängen von der Art ab. */
export const planningConstraintInput = z
  .object({
    kind: z.enum(CONSTRAINT_KINDS),
    hard: z.boolean().default(true),
    active: z.boolean().default(true),
    teacherId: id.nullish().transform((v) => v ?? null),
    classId: id.nullish().transform((v) => v ?? null),
    subjectId: id.nullish().transform((v) => v ?? null),
    roomIds: z.array(id).max(50).default([]),
    weekday: weekday.nullish().transform((v) => v ?? null),
    periods: periods.default([]),
    max: z
      .number()
      .int()
      .min(1)
      .max(20)
      .nullish()
      .transform((v) => v ?? null),
    source: z.enum(CONSTRAINT_SOURCES).default('FORM'),
    text: z
      .string()
      .trim()
      .max(500)
      .nullish()
      .transform((v) => v || null),
  })
  .superRefine((c, ctx) => {
    const need = (
      field: 'teacherId' | 'classId' | 'subjectId' | 'weekday' | 'max',
      ok: boolean,
    ) => {
      if (!ok)
        ctx.addIssue({ code: 'custom', path: [field], message: 'Pflichtfeld für diese Art' });
    };
    switch (c.kind) {
      case 'TEACHER_UNAVAILABLE':
        need('teacherId', !!c.teacherId);
        need('weekday', c.weekday !== null);
        break;
      case 'TEACHER_MAX_PER_DAY':
        need('teacherId', !!c.teacherId);
        need('max', c.max !== null);
        break;
      case 'CLASS_MAX_PER_DAY':
        need('max', c.max !== null);
        break;
      case 'SUBJECT_ROOMS':
        need('subjectId', !!c.subjectId);
        if (c.roomIds.length === 0)
          ctx.addIssue({ code: 'custom', path: ['roomIds'], message: 'Mindestens ein Raum' });
        break;
      case 'CLASS_HOME_ROOM':
        need('classId', !!c.classId);
        if (c.roomIds.length !== 1)
          ctx.addIssue({ code: 'custom', path: ['roomIds'], message: 'Genau ein Raum' });
        break;
      case 'SUBJECT_NOT_PERIODS':
        need('subjectId', !!c.subjectId);
        if (c.periods.length === 0)
          ctx.addIssue({ code: 'custom', path: ['periods'], message: 'Mindestens eine Stunde' });
        break;
      case 'NO_STUDENT_GAPS':
        break;
    }
  });
export type PlanningConstraintInput = z.infer<typeof planningConstraintInput>;

const DAY = ['', 'Mo', 'Di', 'Mi', 'Do', 'Fr'];

const coversPeriod = (c: PlanningConstraint, weekdayOf: number, period: number) =>
  (c.weekday === null || c.weekday === weekdayOf) &&
  (c.periods.length === 0 || c.periods.includes(period));

/** Stunden einer Regel als (Wochentag, Stunde). */
const cells = (l: LessonRule) =>
  Array.from({ length: Math.max(1, l.periodCount) }, (_, i) => l.periodStart + i);

/**
 * Prüft Lehrstunden gegen aktive Wünsche (Code WISH_VIOLATED, hart oder weich wie der Wunsch). Hohlstunden
 * (NO_STUDENT_GAPS) prüft validateTimetable mit den weichen Regeln.
 */
export function checkConstraints(
  lessons: LessonRule[],
  constraints: PlanningConstraint[],
  classesOf: (l: LessonRule) => string[] = (l) => (l.classId ? [l.classId] : []),
): Conflict[] {
  const out: Conflict[] = [];
  const active = constraints.filter((c) => c.active);
  const violation = (
    c: PlanningConstraint,
    lessonIds: string[],
    resource: Conflict['resource'],
    weekdayOf: number | null,
    period: number | null,
    message: string,
  ) =>
    out.push({
      code: 'WISH_VIOLATED',
      severity: c.hard ? 'hard' : 'soft',
      lessonIds,
      resource,
      weekday: weekdayOf,
      period,
      message,
      constraintId: c.id,
    });

  for (const c of active) {
    switch (c.kind) {
      case 'TEACHER_UNAVAILABLE':
        for (const l of lessons)
          if (
            l.teacherIds.includes(c.teacherId!) &&
            cells(l).some((p) => coversPeriod(c, l.weekday, p))
          )
            violation(
              c,
              [l.id],
              { kind: 'teacher', id: c.teacherId! },
              l.weekday,
              l.periodStart,
              `Lehrkraft ist ${DAY[l.weekday]} nicht verfügbar`,
            );
        break;
      case 'SUBJECT_NOT_PERIODS':
        for (const l of lessons)
          if (l.subjectId === c.subjectId && cells(l).some((p) => coversPeriod(c, l.weekday, p)))
            violation(
              c,
              [l.id],
              { kind: 'lesson', id: l.id },
              l.weekday,
              l.periodStart,
              `Fach liegt in einer ausgeschlossenen Stunde (${l.periodStart}.)`,
            );
        break;
      case 'SUBJECT_ROOMS':
        for (const l of lessons)
          if (l.subjectId === c.subjectId && (!l.roomId || !c.roomIds.includes(l.roomId)))
            violation(
              c,
              [l.id],
              { kind: 'lesson', id: l.id },
              l.weekday,
              l.periodStart,
              'Fach liegt nicht im vorgesehenen Raum',
            );
        break;
      case 'TEACHER_MAX_PER_DAY':
      case 'CLASS_MAX_PER_DAY': {
        const perDay = new Map<string, { count: number; ids: string[] }>();
        for (const l of lessons) {
          const keys =
            c.kind === 'TEACHER_MAX_PER_DAY'
              ? l.teacherIds.includes(c.teacherId!)
                ? [c.teacherId!]
                : []
              : classesOf(l).filter((k) => c.classId === null || k === c.classId);
          for (const k of keys) {
            const key = `${k}|${l.weekday}`;
            const e = perDay.get(key) ?? { count: 0, ids: [] };
            e.count += Math.max(1, l.periodCount);
            e.ids.push(l.id);
            perDay.set(key, e);
          }
        }
        for (const [key, e] of perDay) {
          if (e.count <= c.max!) continue;
          const [k, wd] = key.split('|') as [string, string];
          violation(
            c,
            e.ids,
            { kind: c.kind === 'TEACHER_MAX_PER_DAY' ? 'teacher' : 'class', id: k },
            Number(wd),
            null,
            `${e.count} Stunden am ${DAY[Number(wd)]} (höchstens ${c.max})`,
          );
        }
        break;
      }
      case 'CLASS_HOME_ROOM':
      case 'NO_STUDENT_GAPS':
        break; // Vorliebe des Solvers bzw. weiche Regel GAP_STUDENT
    }
  }
  return out;
}

const DAY_LONG = ['', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag'];
const list = (ps: number[]) =>
  ps.length === 1
    ? `${ps[0]}. Stunde`
    : `${ps.slice(0, -1).join('., ')}. und ${ps[ps.length - 1]}. Stunde`;

/** Lesbarer Satz zu einem Wunsch, z. B. "Huber: Freitag nicht verfügbar". Namen liefert der Aufrufer. */
export function describeConstraint(
  c: Pick<
    PlanningConstraint,
    | 'kind'
    | 'hard'
    | 'teacherId'
    | 'classId'
    | 'subjectId'
    | 'roomIds'
    | 'weekday'
    | 'periods'
    | 'max'
  >,
  name: {
    teacher: (id: string) => string;
    subject: (id: string) => string;
    cls: (id: string) => string;
    room: (id: string) => string;
  },
): string {
  const day = c.weekday ? DAY_LONG[c.weekday] : 'an allen Tagen';
  const soft = c.hard ? '' : ' (möglichst)';
  switch (c.kind) {
    case 'TEACHER_UNAVAILABLE':
      return `${name.teacher(c.teacherId!)}: ${day} ${c.periods.length ? `in der ${list(c.periods)} ` : ''}nicht verfügbar${soft}`;
    case 'TEACHER_MAX_PER_DAY':
      return `${name.teacher(c.teacherId!)}: höchstens ${c.max} Stunden am Tag${soft}`;
    case 'CLASS_MAX_PER_DAY':
      return `${c.classId ? name.cls(c.classId) : 'Alle Klassen'}: höchstens ${c.max} Stunden am Tag${soft}`;
    case 'SUBJECT_ROOMS':
      return `${name.subject(c.subjectId!)}: nur in ${c.roomIds.map(name.room).join(', ')}${soft}`;
    case 'CLASS_HOME_ROOM':
      return `${name.cls(c.classId!)}: Stammraum ${name.room(c.roomIds[0]!)}`;
    case 'SUBJECT_NOT_PERIODS':
      return `${name.subject(c.subjectId!)}: nicht in der ${list(c.periods)}${c.weekday ? ` am ${day}` : ''}${soft}`;
    case 'NO_STUDENT_GAPS':
      return `Keine Hohlstunden für Schüler:innen${soft}`;
  }
}
