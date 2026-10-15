import type { Tx } from '@sp/db';
import { secondSemesterFromBreak, semesterRanges, type SemesterRange } from '@sp/shared';

const iso = (d: Date) => d.toISOString().slice(0, 10);

/**
 * Semester eines Schuljahres (SD-01, ADR 0022): Beginn des 2. Semesters am Schuljahr, sonst der Tag nach den
 * Semesterferien. null, wenn beides fehlt.
 */
export async function semestersOf(
  tx: Tx,
  y: { id: string; startsOn: Date; endsOn: Date; secondSemesterFrom: Date | null },
): Promise<[SemesterRange, SemesterRange] | null> {
  let second = y.secondSemesterFrom ? iso(y.secondSemesterFrom) : null;
  if (!second) {
    const free = await tx.schoolFreeDay.findMany({
      where: { schoolYearId: y.id },
      select: { toDate: true, label: true },
    });
    second = secondSemesterFromBreak(free.map((f) => ({ toDate: iso(f.toDate), label: f.label })));
  }
  return semesterRanges({
    startsOn: iso(y.startsOn),
    endsOn: iso(y.endsOn),
    secondSemesterFrom: second,
  });
}
