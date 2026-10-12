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
  'exam.created',
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
  'exam.created': { push: false, email: false },
};

/** Wer welche Typen überhaupt bekommen kann (für die Einstellungsseite). */
export const TYPES_FOR_ROLE: Record<string, NotificationType[]> = {
  STUDENT: ['substitution.published', 'timetable.published', 'exam.created'],
  GUARDIAN: [
    'substitution.published',
    'timetable.published',
    'absence.reminder',
    'absence.reviewed',
    'exam.created',
  ],
  TEACHER: ['substitution.published', 'timetable.published', 'classbook.open'],
  HOMEROOM: ['absence.reported'],
  PRINCIPAL: ['timetable.published'],
  ADMIN: ['timetable.published'],
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
  'exam.created': {
    title: 'Neue Prüfung',
    one: 'Eine Prüfung wurde eingetragen.',
    many: '{n} Prüfungen wurden eingetragen.',
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
