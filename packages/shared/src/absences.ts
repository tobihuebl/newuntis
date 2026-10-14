/**
 * Abwesenheiten von Schüler:innen (Spec Abschnitte 4 AB und 11) und Lehrkräften.
 * Zustände: OPEN (aus dem Klassenbuch, Entschuldigung ausständig) → REPORTED (gemeldet) → EXCUSED oder REJECTED;
 * nach Ablauf der Frist UNEXCUSED. Eine neue Meldung beginnt wieder bei REPORTED.
 */
import { z } from 'zod';
import { dateSchema } from './masterdata';
import { addDays } from './timetable';

export const ABSENCE_STATUSES = ['OPEN', 'REPORTED', 'EXCUSED', 'REJECTED', 'UNEXCUSED'] as const;
export type AbsenceStatusName = (typeof ABSENCE_STATUSES)[number];
export const ABSENCE_REASONS = ['ILLNESS', 'DOCTOR', 'FAMILY', 'OTHER'] as const;
export type AbsenceReason = (typeof ABSENCE_REASONS)[number];
/** Noch zu entschuldigen (Eltern können melden). */
export const EXCUSABLE: readonly AbsenceStatusName[] = ['OPEN', 'UNEXCUSED', 'REJECTED'];

export const absenceReportInput = z
  .object({
    studentId: z.string().min(1),
    fromDate: dateSchema,
    toDate: dateSchema,
    /** Optional nur einzelne Stunden (z. B. Arzttermin): erste und letzte Stunde am ersten bzw. letzten Tag. */
    fromPeriod: z.number().int().min(1).max(20).nullish(),
    toPeriod: z.number().int().min(1).max(20).nullish(),
    reasonCode: z.enum(ABSENCE_REASONS),
    reason: z
      .string()
      .trim()
      .max(1000)
      .nullish()
      .transform((v) => v || null),
  })
  .refine((v) => v.fromDate <= v.toDate, { message: 'Ende vor Beginn', path: ['toDate'] })
  .refine(
    (v) =>
      v.fromPeriod == null ||
      v.toPeriod == null ||
      v.fromDate !== v.toDate ||
      v.fromPeriod <= v.toPeriod,
    { message: 'Letzte Stunde vor erster Stunde', path: ['toPeriod'] },
  );
export type AbsenceReportInput = z.infer<typeof absenceReportInput>;

export const absenceReviewInput = z.object({
  decision: z.enum(['EXCUSED', 'REJECTED']),
  comment: z
    .string()
    .trim()
    .max(1000)
    .nullish()
    .transform((v) => v || null),
});

export const absenceListQuery = z.object({
  studentId: z.string().min(1).optional(),
  classId: z.string().min(1).optional(),
  status: z.enum(ABSENCE_STATUSES).optional(),
  from: dateSchema.optional(),
  to: dateSchema.optional(),
});

export interface AbsenceItem {
  id: string;
  student: { id: string; firstName: string; lastName: string; className: string | null };
  fromAt: string;
  toAt: string;
  status: AbsenceStatusName;
  origin: 'CLASSBOOK' | 'REPORT';
  reasonCode: AbsenceReason | null;
  reason: string | null;
  reviewComment: string | null;
  reviewedAt: string | null;
  /** Ab der eingestellten Dauer ist eine Bestätigung (Foto) Pflicht. */
  attachmentRequired: boolean;
  hasAttachment: boolean;
  /** Bis wann entschuldigt werden muss (nur offene). */
  deadline: string | null;
  /** Darf die anfragende Person entschuldigen bzw. prüfen? */
  canExcuse: boolean;
  canReview: boolean;
  /** Betroffene Unterrichtsstunden (Anzahl). */
  lessons: number;
}

export const TEACHER_ABSENCE_KINDS = ['SICK', 'TRAINING', 'LEAVE', 'OTHER'] as const;

export const teacherAbsenceInput = z
  .object({
    /** Ohne Angabe: die anfragende Lehrkraft selbst. */
    teacherId: z.string().min(1).optional(),
    fromDate: dateSchema,
    toDate: dateSchema,
    fromPeriod: z.number().int().min(1).max(20).nullish(),
    toPeriod: z.number().int().min(1).max(20).nullish(),
    kind: z.enum(TEACHER_ABSENCE_KINDS).default('SICK'),
    note: z
      .string()
      .trim()
      .max(500)
      .nullish()
      .transform((v) => v || null),
  })
  .refine((v) => v.fromDate <= v.toDate, { message: 'Ende vor Beginn', path: ['toDate'] });
export type TeacherAbsenceInput = z.infer<typeof teacherAbsenceInput>;

export interface TeacherAbsenceItem {
  id: string;
  teacher: { id: string; name: string };
  fromAt: string;
  toAt: string;
  kind: (typeof TEACHER_ABSENCE_KINDS)[number];
  note: string | null;
  substitutions: { open: number; assigned: number; published: number };
}

/** Anzahl Kalendertage eines Zeitraums (inklusive). */
export function daySpan(fromDate: string, toDate: string): number {
  return Math.round((Date.parse(toDate) - Date.parse(fromDate)) / 86_400_000) + 1;
}

/**
 * Fehlzeit-Blöcke aus den als abwesend eingetragenen Stunden eines Tages: aufeinanderfolgende Stunden
 * (Lücke höchstens `maxGapMinutes`, also Pausen) werden zusammengefasst.
 */
export function absenceBlocks(
  lessons: { startsAt: Date; endsAt: Date }[],
  maxGapMinutes = 20,
): { fromAt: Date; toAt: Date; lessons: number }[] {
  const sorted = [...lessons].sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
  const out: { fromAt: Date; toAt: Date; lessons: number }[] = [];
  for (const l of sorted) {
    const last = out[out.length - 1];
    if (last && l.startsAt.getTime() - last.toAt.getTime() <= maxGapMinutes * 60_000) {
      if (l.endsAt > last.toAt) last.toAt = l.endsAt;
      last.lessons++;
    } else out.push({ fromAt: l.startsAt, toAt: l.endsAt, lessons: 1 });
  }
  return out;
}

// ───────────────────────── Frühwarnung (AB-05) ─────────────────────────

export const ABSENCE_WARNING_KINDS = ['UNEXCUSED', 'FREQUENT'] as const;
export type AbsenceWarningKind = (typeof ABSENCE_WARNING_KINDS)[number];

export interface AbsenceWarningOptions {
  /** Heute (YYYY-MM-DD, Europe/Vienna). */
  today: string;
  /** Beginn des Schuljahres (YYYY-MM-DD) für die unentschuldigten Stunden. */
  yearStart: string;
  warnUnexcusedLessons: number;
  warnLessons: number;
  warnWindowDays: number;
}

export interface AbsenceWarning {
  studentId: string;
  /** Unentschuldigte Fehlstunden im Schuljahr (abgelehnt oder nicht entschuldigt). */
  unexcused: number;
  /** Fehlstunden insgesamt in den letzten `warnWindowDays` Tagen. */
  recent: number;
  kinds: AbsenceWarningKind[];
}

export interface AbsenceWarningItem extends AbsenceWarning {
  name: string;
  classId: string;
  className: string;
}

/**
 * Frühwarnung bei Häufung von Fehlzeiten (AB-05), reine Funktion. Gezählt werden im Klassenbuch als abwesend
 * eingetragene Stunden; unentschuldigt ist eine Stunde, wenn die Fehlzeit, die sie abdeckt, abgelehnt oder als
 * unentschuldigt markiert ist. Liefert nur Schüler:innen über mindestens einer Schwelle, die meisten Stunden zuerst.
 */
export function absenceWarnings(
  lessons: { studentId: string; date: string; startsAt: Date }[],
  absences: { studentId: string; fromAt: Date; toAt: Date; status: AbsenceStatusName }[],
  o: AbsenceWarningOptions,
): AbsenceWarning[] {
  const windowStart = addDays(o.today, -(o.warnWindowDays - 1));
  const byStudent = new Map<string, { unexcused: number; recent: number }>();
  for (const l of lessons) {
    if (l.date < o.yearStart || l.date > o.today) continue;
    const row = byStudent.get(l.studentId) ?? { unexcused: 0, recent: 0 };
    const cover = absences.find(
      (a) => a.studentId === l.studentId && a.fromAt <= l.startsAt && l.startsAt < a.toAt,
    );
    if (cover && (cover.status === 'UNEXCUSED' || cover.status === 'REJECTED')) row.unexcused++;
    if (l.date >= windowStart) row.recent++;
    byStudent.set(l.studentId, row);
  }
  const out: AbsenceWarning[] = [];
  for (const [studentId, r] of byStudent) {
    const kinds: AbsenceWarningKind[] = [];
    if (o.warnUnexcusedLessons > 0 && r.unexcused >= o.warnUnexcusedLessons)
      kinds.push('UNEXCUSED');
    if (o.warnLessons > 0 && r.recent >= o.warnLessons) kinds.push('FREQUENT');
    if (kinds.length) out.push({ studentId, ...r, kinds });
  }
  return out.sort(
    (a, b) =>
      b.unexcused - a.unexcused || b.recent - a.recent || a.studentId.localeCompare(b.studentId),
  );
}
