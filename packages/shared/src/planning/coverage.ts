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
export const weeklyHours = (l: Pick<LessonRule, 'periodCount' | 'weekPattern'>) =>
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

export interface TeacherProfileRule {
  id: string;
  /** Soll-Unterrichtsstunden je Woche; null = nicht gepflegt. */
  teachingHours: number | null;
  /** Fächer mit Lehrbefähigung; leer = nicht gepflegt (dann keine Fachprüfung). */
  subjectIds: string[];
}

export interface TeacherLoadRow {
  teacherId: string;
  target: number | null;
  /** Summe der Soll-Zeilen dieser Lehrkraft in der Lehrfächerverteilung. */
  assigned: number;
  /** assigned − target: negativ = unter dem Ausmaß, positiv = darüber; null ohne Ausmaß. */
  diff: number | null;
  /** Fächer aus der Lehrfächerverteilung, für die keine Lehrbefähigung hinterlegt ist. */
  unqualified: string[];
}

/**
 * Auslastung je Lehrkraft: Lehrfächerverteilung gegen Unterrichtsausmaß und Fächer. Liefert alle Lehrkräfte mit
 * Soll-Zeilen oder hinterlegtem Ausmaß, sortiert nach der größten Abweichung.
 */
export function teacherLoad(
  requirements: Pick<RequirementRule, 'teacherId' | 'subjectId' | 'hoursPerWeek'>[],
  teachers: TeacherProfileRule[],
): TeacherLoadRow[] {
  const profile = new Map(teachers.map((t) => [t.id, t]));
  const assigned = new Map<string, number>();
  const subjects = new Map<string, Set<string>>();
  for (const r of requirements) {
    assigned.set(r.teacherId, (assigned.get(r.teacherId) ?? 0) + r.hoursPerWeek);
    if (!subjects.has(r.teacherId)) subjects.set(r.teacherId, new Set());
    subjects.get(r.teacherId)!.add(r.subjectId);
  }
  const ids = new Set([
    ...assigned.keys(),
    ...teachers.filter((t) => t.teachingHours !== null).map((t) => t.id),
  ]);
  return [...ids]
    .map((id) => {
      const p = profile.get(id);
      const sum = assigned.get(id) ?? 0;
      const target = p?.teachingHours ?? null;
      const known = new Set(p?.subjectIds ?? []);
      return {
        teacherId: id,
        target,
        assigned: sum,
        diff: target === null ? null : sum - target,
        unqualified:
          known.size === 0 ? [] : [...(subjects.get(id) ?? [])].filter((s) => !known.has(s)),
      };
    })
    .sort(
      (a, b) =>
        Math.abs(b.diff ?? 0) - Math.abs(a.diff ?? 0) ||
        b.unqualified.length - a.unqualified.length ||
        a.teacherId.localeCompare(b.teacherId),
    );
}
