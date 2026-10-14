/** API-Formate des Stundenplan-Assistenten (M7): Läufe, Wünsche speichern, Übersetzen, Festpinnen. */
import { z } from 'zod';
import { planningConstraintInput, type PlanningConstraint } from './constraints';
import type { UnplacedReason } from './solver';

const id = z.string().min(1);

/** Umfang eines Laufs: alles neu, nur bestimmte Klassen oder nur bestimmte Lehrkräfte (Teilplanung). */
export const planningScope = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('all') }),
  z.object({ kind: z.literal('classes'), ids: z.array(id).min(1).max(100) }),
  z.object({ kind: z.literal('teachers'), ids: z.array(id).min(1).max(300) }),
]);
export type PlanningScope = z.infer<typeof planningScope>;

export const planningRunInput = z.object({
  /** Entwurf mit Lehrfächerverteilung (Soll-Stunden) und ggf. festen Stunden. */
  sourceVersionId: id,
  scope: planningScope.default({ kind: 'all' }),
  /** Startwert; ohne Angabe zufällig. Gleicher Startwert = gleicher Vorschlag. */
  seed: z.number().int().min(1).max(2_147_483_647).optional(),
});

export const planningConstraintsCreate = z.object({
  schoolYearId: id,
  constraints: z.array(planningConstraintInput).min(1).max(50),
});
export const planningConstraintPatch = z
  .object({ active: z.boolean().optional(), hard: z.boolean().optional() })
  .refine((v) => v.active !== undefined || v.hard !== undefined, 'Keine Änderung');
export const planningTranslateInput = z.object({
  schoolYearId: id,
  text: z.string().trim().min(3).max(2000),
});
export const lessonPinInput = z.object({ pinned: z.boolean() });

export interface PlanningConstraintItem extends PlanningConstraint {
  /** Lesbare Zusammenfassung mit Namen (nur für die Anzeige). */
  summary: string;
}

export interface PlanningRunStats {
  units: number;
  placed: number;
  repaired: number;
  ms: number;
  hard: number;
  soft: Partial<Record<string, number>>;
  required: number;
  planned: number;
}

export interface PlanningRunItem {
  id: string;
  status: 'QUEUED' | 'RUNNING' | 'DONE' | 'FAILED';
  scope: PlanningScope;
  seed: number;
  sourceVersionId: string | null;
  resultVersionId: string | null;
  stats: PlanningRunStats | null;
  unplaced: {
    requirementId: string;
    periodCount: number;
    reason: UnplacedReason;
    message: string;
  }[];
  error: string | null;
  createdAt: string;
  finishedAt: string | null;
}

export interface TranslateResponse {
  proposals: {
    sentence: string;
    constraint: z.infer<typeof planningConstraintInput>;
    summary: string;
  }[];
  unresolved: string[];
  /** Woher die Vorschläge kommen: nur Regeln oder zusätzlich die KI. */
  engine: 'rules' | 'rules+ai';
}

/** Lehrfächerverteilung als CSV: Vorschau (commit=false) oder Übernehmen (ersetzt alle Soll-Stunden des Entwurfs). */
export const requirementsImportInput = z.object({
  csv: z.string().min(1).max(500_000),
  commit: z.boolean().default(false),
});

export interface RequirementsImportResponse {
  missingColumns: string[];
  rows: {
    line: number;
    raw: { who: string; subject: string; teacher: string; hours: string };
    preferDouble: boolean;
    errors: string[];
    /** Hinweise ohne Sperre, z. B. Fach ohne hinterlegte Lehrbefähigung. */
    warnings: string[];
  }[];
  valid: number;
  invalid: number;
  committed: boolean;
}
