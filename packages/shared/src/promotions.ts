/**
 * Schuljahreswechsel (SD-05, ADR 0019): Klassen ins neue Schuljahr übernehmen und je Schüler:in die Entscheidung
 * am Schuljahresende: aufsteigen, wiederholen, Wiederholungsprüfung (vorläufig aufsteigen) oder Schule verlassen.
 */
import { z } from 'zod';

export const PROMOTION_DECISIONS = ['PROMOTE', 'REPEAT', 'EXAM', 'LEAVE'] as const;
export type PromotionDecision = (typeof PROMOTION_DECISIONS)[number];

/** Stufe aus dem Klassennamen ("3A" → 3, "10B" → 10); ohne führende Zahl null. */
export function levelOf(name: string): number | null {
  const m = /^\s*(\d{1,2})/.exec(name);
  return m ? Number(m[1]) : null;
}

/** Vorschlag für die Folgeklasse: Stufe plus eins, Rest bleibt ("2A" → "3A", "4 HAK" → "5 HAK"). */
export function nextClassName(name: string): string | null {
  const m = /^(\s*)(\d{1,2})(.*)$/.exec(name);
  return m ? `${m[1]}${Number(m[2]) + 1}${m[3]}` : null;
}

// ───────────────────────── Eingaben ─────────────────────────

export const promotionsQuery = z.object({ classId: z.string().min(1) });

export const promotionsInput = z.object({
  classId: z.string().min(1),
  items: z
    .array(
      z.object({
        studentId: z.string().min(1),
        decision: z.enum(PROMOTION_DECISIONS),
        note: z
          .string()
          .trim()
          .max(300)
          .nullish()
          .transform((v) => (v ? v : null)),
      }),
    )
    .min(1)
    .max(60),
});

/** Ergebnis der Wiederholungsprüfung im neuen Schuljahr. */
export const examResultInput = z.object({
  studentId: z.string().min(1),
  passed: z.boolean(),
  /** Bei "nicht bestanden": Klasse der alten Stufe im neuen Schuljahr (sonst Vorschlag des Servers). */
  targetClassId: z
    .string()
    .min(1)
    .nullish()
    .transform((v) => v ?? null),
});

export const transitionQuery = z.object({ toYearId: z.string().min(1) });

export const transitionClassesInput = z.object({
  toYearId: z.string().min(1),
  items: z
    .array(
      z.object({
        fromClassId: z.string().min(1),
        /** Name der Folgeklasse; null = keine Folgeklasse (letzte Stufe, Abschluss). */
        name: z
          .string()
          .trim()
          .max(20)
          .nullish()
          .transform((v) => (v ? v : null)),
        takeHomeroom: z.boolean().default(true),
      }),
    )
    .max(200),
  /** Neue Klassen ohne Vorgänger, z. B. die ersten Klassen. */
  newClasses: z.array(z.string().trim().min(1).max(20)).max(50).default([]),
});

export const transitionStudentsInput = z.object({
  toYearId: z.string().min(1),
  /** Klasse für Schüler:innen, deren Ziel der Server nicht bestimmen kann (studentId → classId). */
  targets: z.record(z.string(), z.string().min(1)).default({}),
});

// ───────────────────────── Antworten ─────────────────────────

export interface PromotionRow {
  studentId: string;
  name: string;
  decision: PromotionDecision;
  /** true, solange niemand ausdrücklich entschieden hat (Standard "steigt auf"). */
  isDefault: boolean;
  note: string | null;
  /** Fächer, deren gewichteter Durchschnitt bei "Nicht genügend" liegt (Hinweis, keine Entscheidung). */
  failing: string[];
}

export interface PromotionsView {
  classId: string;
  className: string;
  /** Letzte Stufe der Schule: "steigt auf" heißt hier "schließt ab". */
  finalLevel: boolean;
  /** Nächstes Schuljahr (muss angelegt sein, damit Entscheidungen Sinn haben). */
  nextYear: { id: string; name: string } | null;
  canDecide: boolean;
  rows: PromotionRow[];
}

/** Kurzfassung für die Klassenseite: Stand der Entscheidungen bzw. offene Wiederholungsprüfungen. */
export interface PromotionSummary {
  nextYear: { id: string; name: string } | null;
  counts: Record<PromotionDecision, number>;
  decided: number;
  /** Im neuen Schuljahr: Schüler:innen dieser Klasse mit offener Wiederholungsprüfung. */
  pendingExams: { studentId: string; name: string; fromClass: string }[];
}

export interface TransitionPlan {
  fromYear: { id: string; name: string; endsOn: string };
  toYear: { id: string; name: string; startsOn: string };
  maxLevel: number | null;
  classes: {
    id: string;
    name: string;
    level: number | null;
    students: number;
    homeroom: string | null;
    /** Bereits angelegte Folgeklasse im Zieljahr. */
    successor: { id: string; name: string } | null;
    /** Vorschlag für den Namen der Folgeklasse (null in der letzten Stufe). */
    suggestion: string | null;
    counts: Record<PromotionDecision, number>;
  }[];
  /** Klassen des Zieljahres. */
  targetClasses: { id: string; name: string; previousClassId: string | null }[];
  /** Vorschau der Übernahme je Schüler:in. */
  students: {
    studentId: string;
    name: string;
    fromClass: string;
    decision: PromotionDecision;
    target: { id: string; name: string } | null;
    /** Schon im Zieljahr eingeschrieben (Übernahme ist erledigt). */
    done: boolean;
  }[];
}
