/**
 * Benachrichtigungen (Spec Abschnitt 12): Typen, Standardkanäle, Einstellungen und die Texte für Push und E-Mail.
 * Push-Texte enthalten keine Namen oder Noten, nur allgemeine Hinweise; Details lädt die App nach dem Öffnen.
 */
import { z } from 'zod';

export const NOTIFICATION_TYPES = [
  'substitution.published',
  'timetable.published',
  'absence.reminder',
  'absence.reported',
  'absence.reviewed',
  'classbook.open',
  'classbook.remark',
  'absence.warning',
  'grade.released',
  'exam.created',
  'message.new',
  'announcement.published',
  'announcement.required',
  'consent.requested',
  'consent.reminder',
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

/** Kanäle neben der Liste in der App (die immer befüllt wird). */
export const CHANNELS = ['push', 'email'] as const;
export type Channel = (typeof CHANNELS)[number];

/** Standard laut Spec-Tabelle; pro Person änderbar. */
export const DEFAULT_CHANNELS: Record<NotificationType, Record<Channel, boolean>> = {
  'substitution.published': { push: true, email: false },
  'timetable.published': { push: true, email: false },
  'absence.reminder': { push: true, email: true },
  'absence.reported': { push: false, email: false },
  'absence.reviewed': { push: true, email: false },
  'classbook.open': { push: false, email: false },
  'classbook.remark': { push: true, email: false },
  'absence.warning': { push: true, email: true },
  'grade.released': { push: true, email: false },
  'exam.created': { push: false, email: false },
  'message.new': { push: true, email: false },
  'announcement.published': { push: true, email: false },
  'announcement.required': { push: true, email: true },
  'consent.requested': { push: true, email: true },
  'consent.reminder': { push: true, email: true },
};

/**
 * Pflichtmitteilungen (Spec Abschnitt 12): Rundschreiben mit Lesebestätigung sind nicht abschaltbar.
 * E-Mail dient als Rückfall für Geräte ohne Push (z. B. iOS ohne installierte App). Ruhezeiten gelten trotzdem.
 */
export const MANDATORY_CHANNELS: Partial<Record<NotificationType, readonly Channel[]>> = {
  'announcement.required': ['push', 'email'],
};

/** Wer welche Typen überhaupt bekommen kann (für die Einstellungsseite). */
const COMMUNICATION: NotificationType[] = [
  'message.new',
  'announcement.published',
  'announcement.required',
];
export const TYPES_FOR_ROLE: Record<string, NotificationType[]> = {
  STUDENT: [
    'substitution.published',
    'timetable.published',
    'exam.created',
    'grade.released',
    ...COMMUNICATION,
  ],
  GUARDIAN: [
    'consent.requested',
    'consent.reminder',
    'substitution.published',
    'timetable.published',
    'absence.reminder',
    'absence.reviewed',
    'exam.created',
    'grade.released',
    ...COMMUNICATION,
  ],
  TEACHER: ['substitution.published', 'timetable.published', 'classbook.open', ...COMMUNICATION],
  HOMEROOM: ['absence.reported', 'absence.warning', 'classbook.remark'],
  PRINCIPAL: ['timetable.published', 'message.new'],
  ADMIN: ['timetable.published', 'message.new'],
};

/** Mehrere gleichartige Ereignisse innerhalb dieser Zeit werden zu einer Push-Nachricht gebündelt. */
export const BUNDLE_SECONDS = 60;

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);

export const preferencesInput = z.object({
  channels: z
    .array(
      z.object({
        type: z.enum(NOTIFICATION_TYPES),
        channel: z.enum(CHANNELS),
        enabled: z.boolean(),
      }),
    )
    .max(50)
    .default([]),
  /** Ruhezeiten (lokal, Europe/Vienna), z. B. 20:00 bis 07:00; null = keine. */
  quiet: z.object({ from: hhmm, to: hhmm }).nullable().optional(),
});
export type PreferencesInput = z.infer<typeof preferencesInput>;

export interface PreferencesResponse {
  types: NotificationType[];
  /** Nicht abschaltbare Kanäle je Typ (Pflichtmitteilungen). */
  mandatory: { type: NotificationType; channel: Channel }[];
  channels: { type: NotificationType; channel: Channel; enabled: boolean }[];
  quiet: { from: string; to: string } | null;
  pushAvailable: boolean;
  vapidPublicKey: string | null;
}

export const pushSubscribeInput = z.object({
  endpoint: z.url().max(2000),
  keys: z.object({ p256dh: z.string().min(1).max(200), auth: z.string().min(1).max(100) }),
});
export const pushUnsubscribeInput = z.object({ endpoint: z.url().max(2000) });

export interface NotificationItem {
  id: string;
  type: NotificationType;
  params: Record<string, string | number>;
  url: string | null;
  readAt: string | null;
  createdAt: string;
}

/** Texte (de-AT) für Push, E-Mail und die Liste in der App. `{n}` = Anzahl gebündelter Ereignisse. */
export const NOTIFICATION_TEXTS: Record<
  NotificationType,
  { title: string; one: string; many: string }
> = {
  'substitution.published': {
    title: 'Stundenplan geändert',
    one: 'Es gibt eine Änderung im Stundenplan für {day}.',
    many: 'Es gibt {n} Änderungen im Stundenplan.',
  },
  'timetable.published': {
    title: 'Neuer Stundenplan',
    one: 'Ab {date} gilt ein neuer Stundenplan.',
    many: 'Ab {date} gilt ein neuer Stundenplan.',
  },
  'absence.reminder': {
    title: 'Entschuldigung ausständig',
    one: 'Bitte eine Fehlzeit entschuldigen.',
    many: 'Bitte {n} Fehlzeiten entschuldigen.',
  },
  'absence.reported': {
    title: 'Neue Entschuldigung',
    one: 'Eine Abwesenheit wurde gemeldet.',
    many: '{n} Abwesenheiten wurden gemeldet.',
  },
  'absence.reviewed': {
    title: 'Entschuldigung bearbeitet',
    one: 'Eine Entschuldigung wurde bearbeitet.',
    many: '{n} Entschuldigungen wurden bearbeitet.',
  },
  'classbook.open': {
    title: 'Klassenbuch',
    one: 'Es sind noch Klassenbucheinträge offen.',
    many: 'Es sind noch Klassenbucheinträge offen.',
  },
  'classbook.remark': {
    title: 'Neuer Vermerk',
    one: 'Im Klassenbuch der Klasse {className} gibt es einen neuen Vermerk.',
    many: 'Im Klassenbuch gibt es {n} neue Vermerke.',
  },
  'absence.warning': {
    title: 'Frühwarnung Fehlzeiten',
    one: 'In der Klasse {className} hat eine Schülerin oder ein Schüler die Warnschwelle für Fehlzeiten erreicht.',
    many: 'In der Klasse {className} haben {n} Schüler:innen die Warnschwelle für Fehlzeiten erreicht.',
  },
  'grade.released': {
    title: 'Neue Note',
    one: 'Eine neue Note in {subject} ist eingetragen.',
    many: '{n} neue Noten sind eingetragen.',
  },
  'exam.created': {
    title: 'Neue Prüfung',
    one: 'Eine Prüfung wurde eingetragen.',
    many: '{n} Prüfungen wurden eingetragen.',
  },
  'message.new': {
    title: 'Neue Nachricht',
    one: 'Eine neue Nachricht ist eingegangen.',
    many: '{n} neue Nachrichten sind eingegangen.',
  },
  'announcement.published': {
    title: 'Neues Rundschreiben',
    one: 'Ein neues Rundschreiben ist erschienen.',
    many: '{n} neue Rundschreiben sind erschienen.',
  },
  'announcement.required': {
    title: 'Lesebestätigung erbeten',
    one: 'Bitte ein Rundschreiben lesen und bestätigen.',
    many: 'Bitte {n} Rundschreiben lesen und bestätigen.',
  },
  'consent.requested': {
    title: 'Einverständnis erbeten',
    one: 'Die Schule bittet um Ihr Einverständnis.',
    many: 'Die Schule bittet {n}-mal um Ihr Einverständnis.',
  },
  'consent.reminder': {
    title: 'Einverständnis noch offen',
    one: 'Eine Einverständniserklärung wartet noch auf Ihre Antwort.',
    many: '{n} Einverständniserklärungen warten noch auf Ihre Antwort.',
  },
};

/** Text einer (gebündelten) Benachrichtigung. Unbekannte Platzhalter bleiben leer. */
export function notificationText(
  type: NotificationType,
  count: number,
  params: Record<string, string | number> = {},
): { title: string; body: string } {
  const t = NOTIFICATION_TEXTS[type];
  const tpl = count > 1 ? t.many : t.one;
  const body = tpl.replace(/\{(\w+)\}/g, (_, k: string) =>
    k === 'n' ? String(count) : String(params[k] ?? ''),
  );
  return { title: t.title, body };
}

/**
 * Liegt ein Zeitpunkt (Minuten seit Mitternacht) in den Ruhezeiten? Ruhezeiten dürfen über Mitternacht
 * gehen (20:00 bis 07:00). Liefert die Minuten bis zum Ende der Ruhezeit oder 0.
 */
export function minutesUntilQuietEnds(
  nowMinutes: number,
  quiet: { from: string; to: string } | null,
): number {
  if (!quiet) return 0;
  const toMin = (s: string) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3, 5));
  const from = toMin(quiet.from);
  const to = toMin(quiet.to);
  if (from === to) return 0;
  const inside =
    from < to ? nowMinutes >= from && nowMinutes < to : nowMinutes >= from || nowMinutes < to;
  if (!inside) return 0;
  return (to - nowMinutes + 1440) % 1440;
}
