/**
 * Supplierung (Spec Abschnitte 4 SU und 11) und Prüfungskalender (PN-01).
 */
import { z } from 'zod';
import { dateSchema } from './masterdata';
import type { PlanEntry } from './timetable-api';

export const SUBSTITUTION_KINDS = ['SUBSTITUTE', 'CANCEL', 'ROOM_CHANGE', 'SUPERVISION'] as const;
export type SubstitutionKindName = (typeof SUBSTITUTION_KINDS)[number];
export const SUBSTITUTION_STATUSES = ['OPEN', 'ASSIGNED', 'PUBLISHED'] as const;

const note = z
  .string()
  .trim()
  .max(500)
  .nullish()
  .transform((v) => v || null);

/** Aktion festlegen: Vertretung und Betreuung brauchen eine Lehrkraft, Raumwechsel einen Raum. */
export const substitutionActionInput = z
  .object({
    kind: z.enum(SUBSTITUTION_KINDS),
    substituteTeacherId: z.string().min(1).nullish(),
    newRoomId: z.string().min(1).nullish(),
    note,
  })
  .refine((v) => !['SUBSTITUTE', 'SUPERVISION'].includes(v.kind) || !!v.substituteTeacherId, {
    message: 'Lehrkraft wählen',
    path: ['substituteTeacherId'],
  })
  .refine((v) => v.kind !== 'ROOM_CHANGE' || !!v.newRoomId, {
    message: 'Raum wählen',
    path: ['newRoomId'],
  });
export type SubstitutionActionInput = z.infer<typeof substitutionActionInput>;

/** Änderung an einer beliebigen Stunde ohne Lehrerabwesenheit (z. B. Entfall wegen Ausflug). */
export const substitutionCreateInput = z.intersection(
  z.object({ occurrenceId: z.string().min(1) }),
  substitutionActionInput,
);

export const substitutionPublishInput = z
  .object({ date: dateSchema.optional(), ids: z.array(z.string().min(1)).max(500).optional() })
  .refine((v) => v.date || v.ids?.length, { message: 'Datum oder Ids angeben' });

export const substitutionListQuery = z.object({ date: dateSchema.optional() });

export interface SubstitutionItem {
  id: string;
  status: (typeof SUBSTITUTION_STATUSES)[number];
  kind: SubstitutionKindName;
  note: string | null;
  substitute: { id: string; name: string } | null;
  newRoom: { id: string; name: string } | null;
  /** Lehrkräfte laut Stundenplan (vor der Supplierung). */
  plannedTeachers: { id: string; name: string }[];
  absentTeacher: { id: string; name: string } | null;
  occurrence: PlanEntry;
  publishedAt: string | null;
  /** Veröffentlicht, aber danach geändert: muss erneut veröffentlicht werden. */
  changedAfterPublish: boolean;
}

export interface SubstitutionDay {
  date: string;
  items: SubstitutionItem[];
  absences: {
    id: string;
    teacher: { id: string; name: string };
    fromAt: string;
    toAt: string;
    kind: string;
  }[];
  rooms: { id: string; name: string }[];
}

export interface Suggestion {
  teacher: { id: string; name: string };
  /** Unterrichtet das Fach. */
  teachesSubject: boolean;
  /** Unterrichtet die Klasse. */
  knowsClass: boolean;
  /** Fairness-Zähler: bisherige Supplier- und Betreuungsstunden im Schuljahr. */
  count: number;
}

/**
 * Reihenfolge der Vorschläge (SU-02): zuerst Eignung (Fach vor Klasse), dann wenigste bisherige
 * Supplierstunden, dann Name. Reine Funktion, getestet.
 */
export function rankSuggestions(xs: Suggestion[]): Suggestion[] {
  const score = (s: Suggestion) => (s.teachesSubject ? 2 : 0) + (s.knowsClass ? 1 : 0);
  return [...xs].sort(
    (a, b) =>
      score(b) - score(a) ||
      a.count - b.count ||
      a.teacher.name.localeCompare(b.teacher.name, 'de'),
  );
}

// ───────────── Prüfungen ─────────────

export const EXAM_KINDS = ['Schularbeit', 'Test', 'Mündlich', 'Sonstiges'] as const;

/** Von/bis Stunde (ADR 0024): beides oder keines; bis nicht vor von. */
const examPeriods = {
  periodStart: z.number().int().min(1).max(20).nullable().default(null),
  periodEnd: z.number().int().min(1).max(20).nullable().default(null),
};
const periodsValid = (v: { periodStart?: number | null; periodEnd?: number | null }) =>
  (v.periodStart == null) === (v.periodEnd == null) &&
  (v.periodStart == null || v.periodEnd! >= v.periodStart);
const periodsMessage = {
  message: 'Bitte von und bis Stunde angeben (bis nicht vor von)',
  path: ['periodEnd'],
};
export const examInput = z
  .object({
    classId: z.string().min(1),
    subjectId: z.string().min(1),
    date: dateSchema,
    title: z.string().trim().min(1).max(120),
    kind: z.enum(EXAM_KINDS),
    ...examPeriods,
    /** Trotz Kollisionswarnung eintragen. */
    force: z.boolean().default(false),
  })
  .refine(periodsValid, periodsMessage);
export const examPatchInput = z
  .object({
    date: dateSchema.optional(),
    title: z.string().trim().min(1).max(120).optional(),
    kind: z.enum(EXAM_KINDS).optional(),
    /** Beide gemeinsam ändern; null + null entfernt die Stunden. */
    periodStart: examPeriods.periodStart.optional(),
    periodEnd: examPeriods.periodEnd.optional(),
    force: z.boolean().default(false),
  })
  .refine(
    (v) => (v.periodStart === undefined) === (v.periodEnd === undefined) && periodsValid(v),
    periodsMessage,
  );
export const examListQuery = z.object({
  from: dateSchema.optional(),
  to: dateSchema.optional(),
  classId: z.string().min(1).optional(),
  studentId: z.string().min(1).optional(),
});

export interface ExamItem {
  id: string;
  date: string;
  title: string;
  kind: string;
  subject: { id: string; name: string; code: string; color: string | null };
  class: { id: string; name: string } | null;
  /** Stunden der Prüfung (null = nur der Tag). */
  periodStart: number | null;
  periodCount: number;
  canEdit: boolean;
}

/** Kollision (Design System, Prüfungskalender): zwei oder mehr Prüfungen einer Klasse am selben Tag. */
export interface ExamCollision {
  date: string;
  classId: string;
  className: string;
  examIds: string[];
}

export function examCollisions(items: readonly ExamItem[]): ExamCollision[] {
  const byKey = new Map<string, ExamCollision>();
  for (const x of items) {
    if (!x.class) continue;
    const key = `${x.date}|${x.class.id}`;
    const c = byKey.get(key) ?? {
      date: x.date,
      classId: x.class.id,
      className: x.class.name,
      examIds: [],
    };
    c.examIds.push(x.id);
    byKey.set(key, c);
  }
  return [...byKey.values()]
    .filter((c) => c.examIds.length > 1)
    .sort((a, b) => a.date.localeCompare(b.date) || a.className.localeCompare(b.className, 'de'));
}

export interface ExamWarning {
  code: 'EXAM_DAY_LIMIT' | 'EXAM_WEEK_LIMIT';
  count: number;
  limit: number;
}

/**
 * Kollisionswarnung (PN-01): mehr Prüfungen am Tag bzw. in der Kalenderwoche als erlaubt?
 * `existing` sind die anderen Prüfungen der Klasse (ohne die geprüfte).
 */
export function examWarnings(
  date: string,
  existing: string[],
  limits: { maxPerDayPerClass: number; maxPerWeekPerClass: number },
): ExamWarning[] {
  const monday = (d: string) => {
    const t = new Date(`${d}T00:00:00Z`);
    t.setUTCDate(t.getUTCDate() - ((t.getUTCDay() + 6) % 7));
    return t.toISOString().slice(0, 10);
  };
  const sameDay = existing.filter((d) => d === date).length + 1;
  const sameWeek = existing.filter((d) => monday(d) === monday(date)).length + 1;
  const out: ExamWarning[] = [];
  if (sameDay > limits.maxPerDayPerClass)
    out.push({ code: 'EXAM_DAY_LIMIT', count: sameDay, limit: limits.maxPerDayPerClass });
  if (sameWeek > limits.maxPerWeekPerClass)
    out.push({ code: 'EXAM_WEEK_LIMIT', count: sameWeek, limit: limits.maxPerWeekPerClass });
  return out;
}
