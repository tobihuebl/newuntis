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
