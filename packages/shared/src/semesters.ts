/**
 * Semester (SD-01, ADR 0022): In Österreich hat jedes Schuljahr zwei Semester. Der Beginn des zweiten steht am
 * Schuljahr (`secondSemesterFrom`); fehlt er, gilt der Tag nach den schulfreien Tagen "Semesterferien".
 */
import { z } from 'zod';
import { addDays } from './timetable';

export type SemesterNo = 1 | 2;

export interface SemesterRange {
  no: SemesterNo;
  from: string;
  to: string;
}

/** Erkennt die Semesterferien unter den schulfreien Tagen. */
const BREAK = /semesterferien/i;

/** Beginn des zweiten Semesters aus den Semesterferien (Tag nach dem letzten freien Tag), sonst null. */
export function secondSemesterFromBreak(
  freeDays: readonly { toDate: string; label: string }[],
): string | null {
  const b = freeDays
    .filter((f) => BREAK.test(f.label))
    .sort((a, z) => a.toDate.localeCompare(z.toDate));
  return b.length ? addDays(b[0]!.toDate, 1) : null;
}

/** Beide Semester eines Schuljahres; null, wenn kein gültiger Beginn des zweiten bekannt ist. */
export function semesterRanges(y: {
  startsOn: string;
  endsOn: string;
  secondSemesterFrom: string | null;
}): [SemesterRange, SemesterRange] | null {
  const s = y.secondSemesterFrom;
  if (!s || s <= y.startsOn || s > y.endsOn) return null;
  return [
    { no: 1, from: y.startsOn, to: addDays(s, -1) },
    { no: 2, from: s, to: y.endsOn },
  ];
}

/** Semester eines Tages (null außerhalb des Schuljahres oder ohne Semester). */
export function semesterOf(
  ranges: readonly SemesterRange[] | null,
  day: string,
): SemesterNo | null {
  return ranges?.find((r) => r.from <= day && day <= r.to)?.no ?? null;
}

/** Optionaler Filter in Abfragen: ?semester=1 oder 2, ohne Angabe das ganze Schuljahr. */
export const semesterQuery = z.object({
  semester: z.coerce
    .number()
    .pipe(z.union([z.literal(1), z.literal(2)]))
    .optional(),
});
