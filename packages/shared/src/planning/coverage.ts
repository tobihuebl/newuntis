/**
 * Soll gegen Ist (M7): Wie viele Wochenstunden einer Soll-Zeile (Lehrfächerverteilung) sind in der Version
 * eingeplant? Grundlage für den Pool im Editor und die Prüfung vor dem Veröffentlichen.
 */
import type { LessonRule } from '../timetable';

export interface RequirementRule {
  id: string;
  subjectId: string;
  classId: string | null;
  groupId: string | null;
  teacherId: string;
  hoursPerWeek: number;
  preferDouble: boolean;
}

export interface CoverageRow {
  requirementId: string;
  required: number;
  planned: number;
  /** planned − required: negativ = zu wenig, positiv = zu viel. */
  diff: number;
}

/** Wochenstunden einer Regel: A/B-Wochen zählen halb. */
export const weeklyHours = (l: LessonRule) =>
  Math.max(1, l.periodCount) * (l.weekPattern === 'EVERY' ? 1 : 0.5);

export const matchesRequirement = (r: RequirementRule, l: LessonRule) =>
  l.subjectId === r.subjectId &&
  (l.classId ?? null) === r.classId &&
  (l.groupId ?? null) === r.groupId &&
  l.teacherIds.includes(r.teacherId);

/**
 * Ordnet jede Regel höchstens einer Soll-Zeile zu (erste passende mit offenem Bedarf), damit zwei Lehrkräfte im
 * Teamteaching nicht doppelt zählen.
 */
export function requirementCoverage(
  requirements: RequirementRule[],
  lessons: LessonRule[],
): CoverageRow[] {
  const planned = new Map(requirements.map((r) => [r.id, 0]));
  for (const l of lessons) {
    const candidates = requirements.filter((r) => matchesRequirement(r, l));
    if (candidates.length === 0) continue;
    const open = candidates.find((r) => planned.get(r.id)! < r.hoursPerWeek) ?? candidates[0]!;
    planned.set(open.id, planned.get(open.id)! + weeklyHours(l));
  }
  return requirements.map((r) => ({
    requirementId: r.id,
    required: r.hoursPerWeek,
    planned: planned.get(r.id)!,
    diff: planned.get(r.id)! - r.hoursPerWeek,
  }));
}
