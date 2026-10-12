/**
 * Heute-Ansicht und Klassenbuch (docs/spec.md Abschnitte 4 KB, 9 und 12).
 * Schreibende Aufrufe tragen eine `clientMutationId` (Offline-Outbox, Idempotenz).
 */
import { z } from 'zod';
import { dateSchema } from './masterdata';
import type { InboxCounts } from './messages';
import type { PlanEntry } from './timetable-api';

export const ATTENDANCE_STATUSES = ['PRESENT', 'LATE', 'ABSENT'] as const;
export type AttendanceStatusName = (typeof ATTENDANCE_STATUSES)[number];

const mutationId = z.string().min(8).max(64);
const text = z
  .string()
  .max(4000)
  .nullish()
  .transform((v) => (v && v.trim() ? v : null));

export const attendanceItemInput = z
  .object({
    studentId: z.string().min(1),
    status: z.enum(ATTENDANCE_STATUSES),
    lateMinutes: z.number().int().min(1).max(240).nullish(),
    clientMutationId: mutationId,
    /** Zeitpunkt der Änderung auf dem Gerät; bei Konflikten gewinnt die spätere Änderung. */
    clientUpdatedAt: z.iso.datetime({ offset: true }),
  })
  .refine((v) => v.status !== 'LATE' || (v.lateMinutes ?? 0) > 0, {
    message: 'Verspätung braucht Minuten',
    path: ['lateMinutes'],
  });
export type AttendanceItemInput = z.infer<typeof attendanceItemInput>;

export const attendanceInput = z.object({ items: z.array(attendanceItemInput).min(1).max(200) });

export const classbookInput = z.object({
  /** Version, auf der die Änderung beruht (0 = noch kein Eintrag). Abweichung: 409 mit aktuellem Stand. */
  baseVersion: z.number().int().min(0),
  topic: text,
  homework: text,
  homeworkDueOn: dateSchema.nullish().transform((v) => v ?? null),
  clientMutationId: mutationId,
});
export type ClassbookInput = z.infer<typeof classbookInput>;

export const closeInput = z.object({ clientMutationId: mutationId });

export const todayQuery = z.object({ studentId: z.string().min(1).optional() });

export interface ClassbookEntryState {
  topic: string | null;
  homework: string | null;
  homeworkDueOn: string | null;
  closedAt: string | null;
  version: number;
}

export interface AttendanceState {
  status: AttendanceStatusName;
  lateMinutes: number | null;
  /** Gerätezeit der wirksamen Änderung (null: vom Server gesetzt, z. B. beim Abschließen). */
  clientUpdatedAt: string | null;
}

/** Ein Termin mit allem, was der Klassenbuch-Screen braucht (auch offline). */
export interface OccurrenceDetail {
  id: string;
  date: string;
  periodStart: number;
  periodCount: number;
  startsAt: string;
  endsAt: string;
  status: PlanEntry['status'];
  subject: PlanEntry['subject'];
  class: PlanEntry['class'];
  group: PlanEntry['group'];
  room: PlanEntry['room'];
  teachers: PlanEntry['teachers'];
  /** Veröffentlichte Supplierung (KB-06): Klasse, Fach und Raum sind vorbelegt. */
  substitution: { kind: 'SUBSTITUTE' | 'CANCEL' | 'ROOM_CHANGE' | 'SUPERVISION' } | null;
  students: { id: string; firstName: string; lastName: string }[];
  attendance: Record<string, AttendanceState>;
  entry: ClassbookEntryState | null;
  /** Darf eintragen (eigene Stunde oder Direktion). */
  canWrite: boolean;
  /** Abschließen ist ab dem Tag der Stunde möglich (nicht bei Entfall). */
  canClose: boolean;
}

/** Stand des Klassenbuchs einer Stunde in der Heute-Liste der Lehrkraft. */
export type ClassbookProgress = 'none' | 'started' | 'closed';

export interface TodayLesson extends PlanEntry {
  classbook: ClassbookProgress | null;
}

export interface TodayHomework {
  occurrenceId: string;
  subject: PlanEntry['subject'];
  text: string;
  dueOn: string;
}

export interface TodayExam {
  id: string;
  date: string;
  title: string;
  kind: string;
  subject: PlanEntry['subject'];
}

export interface TodayChild {
  id: string;
  firstName: string;
  lastName: string;
  className: string | null;
}

export interface TodayResponse {
  date: string;
  /** Serverzeit: der Client berechnet daraus "nächste Stunde" und "läuft gerade". */
  now: string;
  view: 'teacher' | 'student' | 'guardian' | 'none';
  lessons: TodayLesson[];
  /** Schüler:innen und Eltern: Hausübungen bis zum nächsten Schultag. */
  homework: TodayHomework[];
  /** Schüler:innen und Eltern: Prüfungen der nächsten 7 Tage. */
  exams: TodayExam[];
  /** Lehrkräfte: offene Klassenbuch-Einträge und Supplierungen für die Person. */
  teacher: { openEntries: number; substitutions: PlanEntry[] } | null;
  /** Eltern: Kinder zum Umschalten (PL-04) und das gewählte Kind. */
  children: TodayChild[];
  studentId: string | null;
  /** Ungelesene Nachrichten und Rundschreiben (alle Rollen). */
  inbox: InboxCounts;
}

/** Offener Klassenbuch-Eintrag (KB-04): vergangene eigene Stunde ohne Abschluss. */
export type OpenEntry = PlanEntry & { classbook: ClassbookProgress };

/** Ereignisse im Echtzeit-Stream (Spec Abschnitt 9): nur Ids, keine Inhalte. */
export const EVENT_TYPES = [
  'occurrence.updated',
  'timetable.published',
  'substitution.published',
  'absence.reviewed',
  'message.new',
  'announcement.published',
  'notification.new',
  'resync',
] as const;
export type EventType = (typeof EVENT_TYPES)[number];
export interface ServerEvent {
  type: EventType;
  ids: string[];
}

/** Nächster Schultag nach einem Datum (überspringt Samstag und Sonntag, Ferien nicht). */
export function nextWeekday(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  do d.setUTCDate(d.getUTCDate() + 1);
  while (d.getUTCDay() === 0 || d.getUTCDay() === 6);
  return d.toISOString().slice(0, 10);
}
