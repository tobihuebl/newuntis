import { addDays, mondayOf } from '@sp/shared';

/** Heutiges Datum in Wien als "YYYY-MM-DD" (ohne Zusatzbibliothek). */
export function todayVienna(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Vienna',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

export function weekOf(from?: string | null): {
  from: string;
  to: string;
  prev: string;
  next: string;
} {
  const valid = from && /^\d{4}-\d{2}-\d{2}$/.test(from) ? from : todayVienna();
  const monday = mondayOf(valid);
  return {
    from: monday,
    to: addDays(monday, 4),
    prev: addDays(monday, -7),
    next: addDays(monday, 7),
  };
}

export const shortDate = (date: string) =>
  new Intl.DateTimeFormat('de-AT', { day: '2-digit', month: '2-digit', timeZone: 'UTC' }).format(
    new Date(`${date}T00:00:00Z`),
  );

const TZ = 'Europe/Vienna';

/** Uhrzeit eines Zeitpunkts in Wien, z. B. "08:00". */
export const timeOf = (iso: string) =>
  new Intl.DateTimeFormat('de-AT', { hour: '2-digit', minute: '2-digit', timeZone: TZ }).format(
    new Date(iso),
  );

/** Kalendertag lang, z. B. "Montag, 12. Oktober". */
export const longDate = (date: string) =>
  new Intl.DateTimeFormat('de-AT', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  }).format(new Date(`${date}T00:00:00Z`));

/** Kalendertag kurz mit Wochentag, z. B. "Mo., 12.10.". */
export const weekdayDate = (date: string) =>
  new Intl.DateTimeFormat('de-AT', {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    timeZone: 'UTC',
  }).format(new Date(`${date}T00:00:00Z`));

/** Datum und Uhrzeit eines Zeitpunkts, z. B. "12.10., 08:51". */
export const dateTimeOf = (ms: number | string) =>
  new Intl.DateTimeFormat('de-AT', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: TZ,
  }).format(new Date(ms));
