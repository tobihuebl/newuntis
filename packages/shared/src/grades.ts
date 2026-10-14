/**
 * Noten (PN-02, ADR 0018): österreichische Skala 1 bis 5, Leistungen je Notenart (Schularbeit, Test, Mündlich,
 * Mitarbeit), Gewichtung in Prozent je Notenart pro Fach und Klasse oder Gruppe. Noten werden erst nach Freigabe
 * durch die Lehrkraft für Schüler:innen und Eltern sichtbar.
 */
import { z } from 'zod';
import { dateSchema } from './masterdata';

export const GRADE_VALUES = [1, 2, 3, 4, 5] as const;
export type GradeValue = (typeof GRADE_VALUES)[number];

/** Bezeichnungen laut Leistungsbeurteilungsverordnung. */
export const GRADE_LABELS: Record<GradeValue, string> = {
  1: 'Sehr gut',
  2: 'Gut',
  3: 'Befriedigend',
  4: 'Genügend',
  5: 'Nicht genügend',
};

export const ASSESSMENT_KINDS = ['SCHULARBEIT', 'TEST', 'MUENDLICH', 'MITARBEIT'] as const;
export type AssessmentKind = (typeof ASSESSMENT_KINDS)[number];

export type GradeWeights = Record<AssessmentKind, number>;

/** Vorschlag, bis die Lehrkraft eine eigene Gewichtung einstellt (Summe 100). */
export const DEFAULT_WEIGHTS: GradeWeights = {
  SCHULARBEIT: 50,
  TEST: 25,
  MUENDLICH: 10,
  MITARBEIT: 15,
};

/** Notenart aus der Art einer Prüfung im Kalender (PN-01, freier Text "Schularbeit", "Test", "Mündlich"). */
export function kindFromExam(kind: string): AssessmentKind {
  const k = kind.toLowerCase();
  if (k.startsWith('schularbeit')) return 'SCHULARBEIT';
  if (k.startsWith('mündlich') || k.startsWith('muendlich')) return 'MUENDLICH';
  return 'TEST';
}

/**
 * Gewichteter Durchschnitt: jede Notenart für sich gemittelt, dann nach Prozent gewichtet. Notenarten ohne Noten
 * oder mit 0 % fallen heraus, die übrigen Gewichte werden auf 100 % hochgerechnet. Ohne gewichtete Noten: null.
 */
export function weightedAverage(
  grades: { kind: AssessmentKind; value: number }[],
  weights: GradeWeights,
): number | null {
  let sum = 0;
  let total = 0;
  for (const kind of ASSESSMENT_KINDS) {
    const values = grades.filter((g) => g.kind === kind).map((g) => g.value);
    const w = weights[kind];
    if (values.length === 0 || w <= 0) continue;
    sum += (w * values.reduce((a, b) => a + b, 0)) / values.length;
    total += w;
  }
  return total === 0 ? null : Math.round((sum / total) * 100) / 100;
}

/** Notenspiegel einer Leistung: Anzahl je Note und Durchschnitt (zwei Kommastellen). */
export function gradeDistribution(values: number[]): {
  counts: Record<GradeValue, number>;
  average: number | null;
} {
  const counts = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } as Record<GradeValue, number>;
  for (const v of values) if (v in counts) counts[v as GradeValue]++;
  const average = values.length
    ? Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 100) / 100
    : null;
  return { counts, average };
}

// ───────────────────────── Eingaben ─────────────────────────

/** Fach in einer Klasse oder Gruppe ("Kurs"). Genau eines von classId oder groupId. */
export const courseRef = z
  .object({
    classId: z
      .string()
      .min(1)
      .nullish()
      .transform((v) => v ?? null),
    groupId: z
      .string()
      .min(1)
      .nullish()
      .transform((v) => v ?? null),
    subjectId: z.string().min(1),
  })
  .refine((v) => (v.classId === null) !== (v.groupId === null), {
    message: 'Entweder Klasse oder Gruppe',
    path: ['classId'],
  });
export type CourseRef = z.infer<typeof courseRef>;

export const gradeWeightsSchema = z
  .object({
    SCHULARBEIT: z.number().int().min(0).max(100),
    TEST: z.number().int().min(0).max(100),
    MUENDLICH: z.number().int().min(0).max(100),
    MITARBEIT: z.number().int().min(0).max(100),
  })
  .refine((w) => ASSESSMENT_KINDS.reduce((s, k) => s + w[k], 0) === 100, {
    message: 'Die Gewichte müssen zusammen 100 % ergeben',
  });

export const weightingInput = z.object({ course: courseRef, weights: gradeWeightsSchema });

export const assessmentInput = z.object({
  course: courseRef,
  kind: z.enum(ASSESSMENT_KINDS),
  title: z.string().trim().min(1).max(120),
  date: dateSchema,
  /** Optional: Prüfung aus dem Kalender (PN-01), deren Noten hier erfasst werden. */
  examId: z
    .string()
    .min(1)
    .nullish()
    .transform((v) => v ?? null),
});
export const assessmentPatch = z
  .object({
    kind: z.enum(ASSESSMENT_KINDS),
    title: z.string().trim().min(1).max(120),
    date: dateSchema,
  })
  .partial();

export const gradesInput = z.object({
  items: z
    .array(
      z.object({
        studentId: z.string().min(1),
        /** null entfernt die Note (z. B. nicht erschienen). */
        value: z.number().int().min(1).max(5).nullable(),
        comment: z
          .string()
          .trim()
          .max(500)
          .nullish()
          .transform((v) => (v ? v : null)),
      }),
    )
    .min(1)
    .max(80),
});

export const myGradesQuery = z.object({ studentId: z.string().min(1).optional() });

// ───────────────────────── Antworten ─────────────────────────

export interface CourseSummary {
  classId: string | null;
  groupId: string | null;
  subjectId: string;
  /** "1A" oder Gruppenname. */
  label: string;
  subject: { id: string; name: string; code: string; color: string | null };
  assessments: number;
  /** Leistungen mit noch nicht freigegebenen Noten. */
  unreleased: number;
}

export interface AssessmentItem {
  id: string;
  kind: AssessmentKind;
  title: string;
  date: string;
  examId: string | null;
  releasedAt: string | null;
  distribution: { counts: Record<GradeValue, number>; average: number | null };
}

export interface CourseDetail {
  course: CourseSummary;
  /** Darf Noten eintragen (Lehrkraft des Fachs in dieser Klasse oder Gruppe). */
  canWrite: boolean;
  weights: GradeWeights;
  /** true, solange die Lehrkraft keine eigene Gewichtung gespeichert hat. */
  defaultWeights: boolean;
  students: { id: string; name: string }[];
  assessments: AssessmentItem[];
  /** grades[assessmentId][studentId] = Note */
  grades: Record<string, Record<string, number>>;
  comments: Record<string, Record<string, string>>;
  /** Gewichteter Durchschnitt je Schüler:in über alle (auch nicht freigegebenen) Leistungen. */
  averages: Record<string, number | null>;
  /** Prüfungen aus dem Kalender ohne erfasste Noten, als Vorschlag für neue Leistungen. */
  examSuggestions: { id: string; title: string; date: string; kind: AssessmentKind }[];
}

/** Notenübersicht einer Klasse (KV, Direktion, Administration): Durchschnitt je Schüler:in und Fach. */
export interface ClassGradesOverview {
  classId: string;
  className: string;
  subjects: { id: string; name: string; code: string }[];
  students: { id: string; name: string; averages: Record<string, number | null> }[];
}

/** Eigene Noten (Schüler:in) bzw. die eines Kindes (Eltern): nur freigegebene Leistungen. */
export interface StudentGrades {
  student: { id: string; name: string };
  subjects: {
    subject: { id: string; name: string; code: string; color: string | null };
    average: number | null;
    weights: GradeWeights;
    assessments: {
      id: string;
      kind: AssessmentKind;
      title: string;
      date: string;
      value: number | null;
      comment: string | null;
      distribution: { counts: Record<GradeValue, number>; average: number | null };
    }[];
  }[];
}
