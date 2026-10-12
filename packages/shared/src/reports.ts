/**
 * Direktions-Lagebild (DB-02) und Basis-Auswertungen (DB-03, Spec Abschnitt 4 und 9) sowie der CSV-Export.
 */
import { z } from 'zod';

export const dashboardQuery = z.object({ date: z.iso.date().optional() });

export type TimelineKind =
  'cancelled' | 'substituted' | 'roomChanged' | 'supervision' | 'open' | 'missingClassbook';

export interface TimelineItem {
  occurrenceId: string;
  kind: TimelineKind;
  periodStart: number;
  periodCount: number;
  startsAt: string;
  endsAt: string;
  className: string | null;
  subject: string;
  teachers: string[];
}

export interface DashboardTeacherAbsence {
  id: string;
  teacher: { id: string; name: string };
  kind: string;
  fromAt: string;
  toAt: string;
  /** Betroffene Stunden an diesem Tag, davon noch nicht veröffentlicht. */
  affected: number;
  open: number;
}

export interface DashboardMissingEntry {
  occurrenceId: string;
  date: string;
  periodStart: number;
  className: string | null;
  subject: string;
  teachers: string[];
}

export interface PrincipalDashboard {
  date: string;
  cards: {
    teachersAbsent: number;
    cancelled: number;
    openSubstitutions: number;
    missingClassbook: number;
    studentsAbsent: number;
    pendingExcuses: number;
  };
  teachersAbsent: DashboardTeacherAbsence[];
  /** Vergangene Stunden der letzten 7 Tage ohne abgeschlossenen Klassenbuch-Eintrag. */
  missingClassbook: DashboardMissingEntry[];
  /** Betroffene Stunden des Tages in zeitlicher Reihenfolge. */
  timeline: TimelineItem[];
}

export const reportQuery = z
  .object({
    from: z.iso.date(),
    to: z.iso.date(),
    classId: z.string().min(1).max(64).optional(),
    format: z.enum(['json', 'csv']).default('json'),
  })
  .refine((q) => q.from <= q.to, { message: 'Beginn nach Ende', path: ['to'] })
  .refine((q) => daysBetween(q.from, q.to) <= 400, {
    message: 'Höchstens ein Schuljahr',
    path: ['to'],
  });
export type ReportQuery = z.infer<typeof reportQuery>;

export interface AbsenceCounts {
  open: number;
  reported: number;
  excused: number;
  rejected: number;
  unexcused: number;
}

export interface AttendanceClassRow {
  classId: string;
  className: string;
  students: number;
  /** Stunden mit erfasster Anwesenheit. */
  lessons: number;
  absentLessons: number;
  lateLessons: number;
  absences: AbsenceCounts;
}

export interface AttendanceStudentRow {
  studentId: string;
  name: string;
  absentLessons: number;
  lateLessons: number;
  lateMinutes: number;
  absences: AbsenceCounts;
}

export interface AttendanceReport {
  from: string;
  to: string;
  classes: AttendanceClassRow[];
  /** Nur mit classId: je Schüler:in. */
  students: AttendanceStudentRow[] | null;
}

export interface SubstitutionTeacherRow {
  teacherId: string;
  name: string;
  /** Vertretungen und Betreuungen, die die Person übernommen hat (veröffentlicht). */
  substituted: number;
  supervised: number;
  /** Eigene Stunden, die wegen Abwesenheit vertreten wurden oder entfallen sind. */
  missed: number;
}

export interface SubstitutionReport {
  from: string;
  to: string;
  totals: { substitutions: number; supervisions: number; cancelled: number; roomChanges: number };
  teachers: SubstitutionTeacherRow[];
}

export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

/**
 * CSV für Excel in Österreich: Strichpunkt als Trenner, UTF-8 mit BOM, CRLF. Zellen, die mit = + - @ beginnen,
 * erhalten ein Hochkomma, damit Tabellenprogramme sie nicht als Formel ausführen (CSV-Injection).
 */
export function toCsv(rows: readonly (readonly (string | number | null | undefined)[])[]): string {
  const cell = (v: string | number | null | undefined): string => {
    if (v === null || v === undefined) return '';
    let s = String(v);
    if (typeof v === 'string' && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
    return /[";\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return `\uFEFF${rows.map((r) => r.map(cell).join(';')).join('\r\n')}\r\n`;
}
