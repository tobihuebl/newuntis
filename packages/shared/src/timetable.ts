/**
 * Stundenplan-Kern (docs/spec.md Abschnitt 10): Konfliktprüfung, Wochenmuster A/B und Terminerzeugung.
 * Reine Funktionen ohne Datenbank: die API lädt die Daten, der Editor im Browser prüft damit live.
 */
import { DateTime } from 'luxon';
import type { WeekPattern } from './constants';

export interface LessonRule {
  id: string;
  weekday: number; // 1 = Montag bis 5 = Freitag
  periodStart: number;
  periodCount: number;
  weekPattern: WeekPattern;
  subjectId: string;
  classId: string | null;
  groupId: string | null;
  roomId: string | null;
  teacherIds: string[];
}

export interface PeriodInfo {
  number: number;
  startTime: string; // "08:00" lokal
  endTime: string;
  blocksDouble: boolean;
}

export interface ValidationContext {
  periods: PeriodInfo[];
  /** Schüler:innen je Klasse (aktuelle Einschreibungen). */
  classStudents: Record<string, string[]>;
  /** Mitglieder je Gruppe. */
  groupMembers: Record<string, string[]>;
  /** Plätze je Raum (null = unbekannt). */
  roomCapacity: Record<string, number | null>;
  /**
   * Weiche Regeln (SP-06, Hohlstunden, Tagesbelastung, gleiches Fach zweimal am Tag). Ohne Angabe werden sie
   * nicht geprüft; Editor und Solver geben sie an.
   */
  soft?: { dayLoadMax: number };
}

export const CONFLICT_CODES = [
  'TEACHER_DOUBLE',
  'ROOM_DOUBLE',
  'STUDENT_DOUBLE',
  'OUT_OF_GRID',
  'MISSING_RESOURCE',
  'ROOM_CAPACITY',
  'GAP_STUDENT',
  'GAP_TEACHER',
  'DAY_LOAD',
  'SAME_SUBJECT_TWICE',
  'WISH_VIOLATED',
] as const;
export type ConflictCode = (typeof CONFLICT_CODES)[number];

export interface Conflict {
  code: ConflictCode;
  /** hart = blockiert die Veröffentlichung, weich = Warnung. */
  severity: 'hard' | 'soft';
  lessonIds: string[];
  /** Betroffene Ressource (Lehrkraft, Raum, Klasse, Gruppe oder Schüler:in), für die Anzeige von Namen. */
  resource: {
    kind: 'teacher' | 'room' | 'class' | 'group' | 'student' | 'lesson';
    id: string;
  } | null;
  weekday: number | null;
  period: number | null;
  message: string;
  /** Bei WISH_VIOLATED: der verletzte Planungswunsch. */
  constraintId?: string;
}

const DAY = ['', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
const where = (weekday: number, period: number) => `${DAY[weekday] ?? weekday}, ${period}. Stunde`;

/** EVERY überlappt mit A und B, A überlappt nicht mit B. */
export function patternsOverlap(a: WeekPattern, b: WeekPattern): boolean {
  return a === 'EVERY' || b === 'EVERY' || a === b;
}
const halves = (p: WeekPattern): ('A' | 'B')[] => (p === 'EVERY' ? ['A', 'B'] : [p]);

/** Schülermenge einer Regel; Klasse und Gruppe zählen selbst als Mitglied, damit z. B. eine leere Klasse nicht doppelt belegt wird. */
function studentKeys(l: LessonRule, ctx: ValidationContext): string[] {
  if (l.classId) return [`class:${l.classId}`, ...(ctx.classStudents[l.classId] ?? [])];
  if (l.groupId) return [`group:${l.groupId}`, ...(ctx.groupMembers[l.groupId] ?? [])];
  return [];
}

/**
 * Prüft alle Regeln einer Version. Bildet Buckets je (Wochentag, Stunde, Wochenhälfte A/B) und sucht darin
 * Doppelbelegungen je Lehrkraft, Raum und Schüler:in. Laufzeit linear in der Zahl der Regeln (mal Schüler je Regel).
 *
 * Mit `change` wird eine einzelne geänderte oder neue Regel geprüft; geliefert werden nur Konflikte, an denen sie beteiligt ist.
 */
export function validateTimetable(
  lessons: LessonRule[],
  ctx: ValidationContext,
  change?: { lesson: LessonRule },
): Conflict[] {
  const all = change
    ? [...lessons.filter((l) => l.id !== change.lesson.id), change.lesson]
    : lessons;
  const conflicts = new Map<string, Conflict>();
  const add = (c: Conflict) => {
    const key = `${c.code}|${c.resource?.kind ?? ''}:${c.resource?.id ?? ''}|${[...c.lessonIds].sort().join(',')}`;
    if (!conflicts.has(key)) conflicts.set(key, { ...c, lessonIds: [...c.lessonIds].sort() });
  };

  const periods = new Map(ctx.periods.map((p) => [p.number, p]));

  // Einzelregel-Prüfungen
  for (const l of all) {
    if (l.teacherIds.length === 0)
      add({
        code: 'MISSING_RESOURCE',
        severity: 'hard',
        lessonIds: [l.id],
        resource: { kind: 'lesson', id: l.id },
        weekday: l.weekday,
        period: l.periodStart,
        message: `Keine Lehrkraft eingetragen (${where(l.weekday, l.periodStart)})`,
      });
    if (!l.classId === !l.groupId)
      add({
        code: 'MISSING_RESOURCE',
        severity: 'hard',
        lessonIds: [l.id],
        resource: { kind: 'lesson', id: l.id },
        weekday: l.weekday,
        period: l.periodStart,
        message: `Genau eine Klasse oder Gruppe nötig (${where(l.weekday, l.periodStart)})`,
      });

    let outOfGrid =
      l.weekday < 1 || l.weekday > 5 || l.periodCount < 1 || !Number.isInteger(l.periodCount);
    for (let p = l.periodStart; !outOfGrid && p < l.periodStart + l.periodCount; p++) {
      const period = periods.get(p);
      if (!period) outOfGrid = true;
      else if (p < l.periodStart + l.periodCount - 1 && period.blocksDouble) outOfGrid = true; // Doppelstunde über eine Pause hinweg
    }
    if (outOfGrid)
      add({
        code: 'OUT_OF_GRID',
        severity: 'hard',
        lessonIds: [l.id],
        resource: { kind: 'lesson', id: l.id },
        weekday: l.weekday,
        period: l.periodStart,
        message: `Liegt außerhalb des Rasters oder überspannt eine Pause (${where(l.weekday, l.periodStart)})`,
      });

    if (l.roomId) {
      const capacity = ctx.roomCapacity[l.roomId];
      const size = l.classId
        ? (ctx.classStudents[l.classId]?.length ?? 0)
        : l.groupId
          ? (ctx.groupMembers[l.groupId]?.length ?? 0)
          : 0;
      if (capacity !== null && capacity !== undefined && size > capacity) {
        add({
          code: 'ROOM_CAPACITY',
          severity: 'soft',
          lessonIds: [l.id],
          resource: { kind: 'room', id: l.roomId },
          weekday: l.weekday,
          period: l.periodStart,
          message: `Raum hat ${capacity} Plätze, Klasse/Gruppe hat ${size} (${where(l.weekday, l.periodStart)})`,
        });
      }
    }
  }

  // Doppelbelegungen je Bucket
  type Bucket = {
    teacher: Map<string, string[]>;
    room: Map<string, string[]>;
    student: Map<string, string[]>;
  };
  const buckets = new Map<string, Bucket>();
  for (const l of all) {
    const students = studentKeys(l, ctx);
    for (let p = l.periodStart; p < l.periodStart + Math.max(1, l.periodCount); p++) {
      for (const half of halves(l.weekPattern)) {
        const key = `${l.weekday}|${p}|${half}`;
        let b = buckets.get(key);
        if (!b) buckets.set(key, (b = { teacher: new Map(), room: new Map(), student: new Map() }));
        const push = (m: Map<string, string[]>, k: string) => {
          const list = m.get(k);
          if (!list) m.set(k, [l.id]);
          else if (!list.includes(l.id)) list.push(l.id);
        };
        for (const t of l.teacherIds) push(b.teacher, t);
        if (l.roomId) push(b.room, l.roomId);
        for (const s of students) push(b.student, s);
      }
    }
  }
  for (const [key, b] of buckets) {
    const [wd, p] = key.split('|').map(Number) as [number, number];
    for (const [teacher, ids] of b.teacher) {
      if (ids.length > 1)
        add({
          code: 'TEACHER_DOUBLE',
          severity: 'hard',
          lessonIds: ids,
          resource: { kind: 'teacher', id: teacher },
          weekday: wd,
          period: p,
          message: `Lehrkraft doppelt belegt (${where(wd, p)})`,
        });
    }
    for (const [room, ids] of b.room) {
      if (ids.length > 1)
        add({
          code: 'ROOM_DOUBLE',
          severity: 'hard',
          lessonIds: ids,
          resource: { kind: 'room', id: room },
          weekday: wd,
          period: p,
          message: `Raum doppelt belegt (${where(wd, p)})`,
        });
    }
    // Schüler:innen: je Gruppe von Regeln nur ein Konflikt (nicht einer pro Schüler:in)
    const seenSets = new Set<string>();
    for (const [student, ids] of b.student) {
      if (ids.length < 2) continue;
      const setKey = [...ids].sort().join(',');
      if (seenSets.has(setKey)) continue;
      seenSets.add(setKey);
      const [kind, id] = student.startsWith('class:')
        ? ['class', student.slice(6)]
        : student.startsWith('group:')
          ? ['group', student.slice(6)]
          : ['student', student];
      add({
        code: 'STUDENT_DOUBLE',
        severity: 'hard',
        lessonIds: ids,
        resource: { kind: kind as 'class' | 'group' | 'student', id: id! },
        weekday: wd,
        period: p,
        message: `Klasse oder Schüler:innen doppelt belegt (${where(wd, p)})`,
      });
    }
  }

  if (ctx.soft) for (const c of softConflicts(all, ctx, ctx.soft.dayLoadMax)) add(c);

  const result = [...conflicts.values()];
  return change ? result.filter((c) => c.lessonIds.includes(change.lesson.id)) : result;
}

/**
 * Weiche Regeln je Wochentag und Wochenhälfte: Hohlstunden von Klassen und Lehrkräften, mehr Stunden als
 * `dayLoadMax` für eine Klasse, dasselbe Fach zweimal am Tag (außer direkt hintereinander, also Doppelstunde).
 * Gruppenstunden zählen für jede Klasse, aus der Mitglieder in der Gruppe sind.
 */
function softConflicts(all: LessonRule[], ctx: ValidationContext, dayLoadMax: number): Conflict[] {
  const out: Conflict[] = [];
  const classOf = new Map<string, string>();
  for (const [classId, students] of Object.entries(ctx.classStudents))
    for (const s of students) classOf.set(s, classId);
  const classesOf = (l: LessonRule): string[] => {
    if (l.classId) return [l.classId];
    if (!l.groupId) return [];
    return [...new Set((ctx.groupMembers[l.groupId] ?? []).flatMap((s) => classOf.get(s) ?? []))];
  };

  // Belegte Stunden je (Ressource, Tag, Hälfte)
  type Day = { periods: Set<number>; lessons: Set<string> };
  const days = new Map<string, Day>();
  const mark = (key: string, l: LessonRule) => {
    let d = days.get(key);
    if (!d) days.set(key, (d = { periods: new Set(), lessons: new Set() }));
    for (let p = l.periodStart; p < l.periodStart + Math.max(1, l.periodCount); p++)
      d.periods.add(p);
    d.lessons.add(l.id);
  };
  for (const l of all)
    for (const half of halves(l.weekPattern)) {
      for (const c of classesOf(l)) mark(`class|${c}|${l.weekday}|${half}`, l);
      for (const t of l.teacherIds) mark(`teacher|${t}|${l.weekday}|${half}`, l);
    }

  const seen = new Set<string>();
  for (const [key, d] of days) {
    const [kind, id, wd] = key.split('|') as ['class' | 'teacher', string, string];
    const weekday = Number(wd);
    const sorted = [...d.periods].sort((a, b) => a - b);
    const gaps = sorted.length ? sorted[sorted.length - 1]! - sorted[0]! + 1 - sorted.length : 0;
    const dedupe = (code: string) => {
      const k = `${code}|${kind}|${id}|${weekday}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    };
    if (gaps > 0 && dedupe('GAP'))
      out.push({
        code: kind === 'class' ? 'GAP_STUDENT' : 'GAP_TEACHER',
        severity: 'soft',
        lessonIds: [...d.lessons],
        resource: { kind, id },
        weekday,
        period: null,
        message: `${gaps} ${gaps === 1 ? 'Hohlstunde' : 'Hohlstunden'} am ${DAY[weekday]}`,
      });
    if (kind === 'class' && sorted.length > dayLoadMax && dedupe('LOAD'))
      out.push({
        code: 'DAY_LOAD',
        severity: 'soft',
        lessonIds: [...d.lessons],
        resource: { kind, id },
        weekday,
        period: null,
        message: `${sorted.length} Stunden am ${DAY[weekday]} (mehr als ${dayLoadMax})`,
      });
  }

  // Gleiches Fach zweimal am Tag je Klasse bzw. Gruppe (getrennte Stunden, nicht direkt hintereinander)
  const bySubject = new Map<string, LessonRule[]>();
  for (const l of all) {
    const who = l.classId ? `class|${l.classId}` : l.groupId ? `group|${l.groupId}` : null;
    if (!who) continue;
    for (const half of halves(l.weekPattern)) {
      const k = `${who}|${l.subjectId}|${l.weekday}|${half}`;
      bySubject.set(k, [...(bySubject.get(k) ?? []), l]);
    }
  }
  for (const [key, list] of bySubject) {
    if (list.length < 2) continue;
    const blocks = [...list].sort((a, b) => a.periodStart - b.periodStart);
    let separate = 1;
    for (let i = 1; i < blocks.length; i++) {
      const prev = blocks[i - 1]!;
      if (blocks[i]!.periodStart !== prev.periodStart + prev.periodCount) separate++;
    }
    if (separate < 2) continue;
    const [kind, id, , wd] = key.split('|') as ['class' | 'group', string, string, string];
    const k = `SAME|${kind}|${id}|${key.split('|')[2]}|${wd}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push({
      code: 'SAME_SUBJECT_TWICE',
      severity: 'soft',
      lessonIds: list.map((l) => l.id),
      resource: { kind, id },
      weekday: Number(wd),
      period: null,
      message: `Gleiches Fach ${separate}-mal am ${DAY[Number(wd)]}`,
    });
  }
  return out;
}

export const hasHardConflicts = (conflicts: Conflict[]) =>
  conflicts.some((c) => c.severity === 'hard');

// ───────────────────────── Datum, Wochenmuster ─────────────────────────

/** ISO-Wochentag 1 (Montag) bis 7 (Sonntag) eines Kalendertags "YYYY-MM-DD". */
export function isoWeekday(date: string): number {
  const d = new Date(`${date}T00:00:00Z`).getUTCDay();
  return d === 0 ? 7 : d;
}

export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function mondayOf(date: string): string {
  return addDays(date, 1 - isoWeekday(date));
}

/**
 * A- oder B-Woche: gerade Zahl von Wochen seit dem Referenz-Montag = A.
 * Gezählt wird über Tage, nicht über ISO-Wochennummern: Jahre mit 53 Kalenderwochen (z. B. 2026) brechen die Folge sonst.
 */
export function weekHalfOf(date: string, referenceMonday: string): 'A' | 'B' {
  const diff =
    (Date.parse(`${mondayOf(date)}T00:00:00Z`) -
      Date.parse(`${mondayOf(referenceMonday)}T00:00:00Z`)) /
    86_400_000;
  const weeks = Math.round(diff / 7);
  return ((weeks % 2) + 2) % 2 === 0 ? 'A' : 'B';
}

export function ruleAppliesOn(
  rule: Pick<LessonRule, 'weekday' | 'weekPattern'>,
  date: string,
  referenceMonday: string,
): boolean {
  if (rule.weekday !== isoWeekday(date)) return false;
  return rule.weekPattern === 'EVERY' || rule.weekPattern === weekHalfOf(date, referenceMonday);
}

/** Lokale Uhrzeit (z. B. Europe/Vienna) an einem Kalendertag als UTC-Zeitpunkt; sommerzeitsicher über Luxon. */
export function localToUtc(date: string, time: string, timezone: string): Date {
  const dt = DateTime.fromISO(`${date}T${time}`, { zone: timezone });
  if (!dt.isValid) throw new Error(`Ungültige Zeit ${date} ${time} (${timezone})`);
  return dt.toJSDate();
}

export function isFreeDay(date: string, freeDays: { fromDate: string; toDate: string }[]): boolean {
  return freeDays.some((f) => f.fromDate <= date && date <= f.toDate);
}

export interface PlannedOccurrence {
  lessonId: string;
  date: string;
  periodStart: number;
  periodCount: number;
  startsAt: Date;
  endsAt: Date;
  subjectId: string;
  classId: string | null;
  groupId: string | null;
  roomId: string | null;
  teacherIds: string[];
}

/** Termine eines Tages aus den Regeln (ohne Wochenende und schulfreie Tage). Regeln außerhalb des Rasters werden übersprungen. */
export function planDay(
  date: string,
  input: {
    lessons: LessonRule[];
    periods: PeriodInfo[];
    freeDays: { fromDate: string; toDate: string }[];
    referenceMonday: string;
    timezone: string;
  },
): PlannedOccurrence[] {
  if (isoWeekday(date) > 5 || isFreeDay(date, input.freeDays)) return [];
  const periods = new Map(input.periods.map((p) => [p.number, p]));
  const out: PlannedOccurrence[] = [];
  for (const l of input.lessons) {
    if (!ruleAppliesOn(l, date, input.referenceMonday)) continue;
    const first = periods.get(l.periodStart);
    const last = periods.get(l.periodStart + l.periodCount - 1);
    if (!first || !last) continue;
    out.push({
      lessonId: l.id,
      date,
      periodStart: l.periodStart,
      periodCount: l.periodCount,
      startsAt: localToUtc(date, first.startTime, input.timezone),
      endsAt: localToUtc(date, last.endTime, input.timezone),
      subjectId: l.subjectId,
      classId: l.classId,
      groupId: l.groupId,
      roomId: l.roomId,
      teacherIds: [...l.teacherIds],
    });
  }
  return out;
}
