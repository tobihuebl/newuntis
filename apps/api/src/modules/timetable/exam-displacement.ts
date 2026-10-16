import type { Tx } from '@sp/db';
import { asDate } from './data';

/**
 * Mehrstündige Prüfungen (ADR 0024): Termine der Klasse in den Stunden einer Prüfung entfallen automatisch
 * (status CANCELLED, displacedByExamId). Termine des Prüfungsfachs bleiben (dort findet die Prüfung statt).
 * Termine mit Klassenbuch, Anwesenheit, Vermerken oder Supplierung werden nie angefasst.
 */
const untouched = {
  classbook: { is: null },
  substitution: { is: null },
  attendances: { none: {} },
  remarks: { none: {} },
} as const;

/** Verdrängung einer Prüfung neu setzen: alte zurücknehmen, dann nach aktuellem Stand verdrängen. */
export async function applyExamDisplacement(
  tx: Tx,
  examId: string,
): Promise<{ restored: string[]; displaced: string[] }> {
  const restored = await restore(tx, examId);
  const x = await tx.exam.findUnique({ where: { id: examId } });
  if (!x || x.periodStart === null || !x.classId) return { restored, displaced: [] };
  const end = x.periodStart + x.periodCount - 1;
  const candidates = await tx.occurrence.findMany({
    where: {
      classId: x.classId,
      date: x.date,
      status: 'SCHEDULED',
      subjectId: { not: x.subjectId },
      periodStart: { lte: end },
      ...untouched,
    },
    select: { id: true, periodStart: true, periodCount: true },
  });
  const displaced = candidates
    .filter((o) => o.periodStart + o.periodCount - 1 >= x.periodStart!)
    .map((o) => o.id);
  if (displaced.length)
    await tx.occurrence.updateMany({
      where: { id: { in: displaced } },
      data: { status: 'CANCELLED', displacedByExamId: x.id },
    });
  return { restored, displaced };
}

/** Verdrängung einer Prüfung zurücknehmen (vor dem Löschen oder Ändern). */
export async function restore(tx: Tx, examId: string): Promise<string[]> {
  const rows = await tx.occurrence.findMany({
    where: { displacedByExamId: examId, status: 'CANCELLED', ...untouched },
    select: { id: true },
  });
  const ids = rows.map((r) => r.id);
  if (ids.length)
    await tx.occurrence.updateMany({
      where: { id: { in: ids } },
      data: { status: 'SCHEDULED', displacedByExamId: null },
    });
  return ids;
}

/** Nach dem Erzeugen von Terminen: Prüfungen mit Stunden im Zeitraum verdrängen auch die neuen Termine. */
export async function applyExamDisplacementInRange(tx: Tx, from: string, to: string) {
  const exams = await tx.exam.findMany({
    where: {
      date: { gte: asDate(from), lte: asDate(to) },
      periodStart: { not: null },
      classId: { not: null },
    },
    select: { id: true },
  });
  for (const x of exams) await applyExamDisplacement(tx, x.id);
}
