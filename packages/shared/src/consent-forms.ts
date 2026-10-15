/**
 * Digitale Einverständniserklärungen (KO-05, ADR 0021): Lehrkräfte, Klassenvorstand, Direktion und Administration
 * bitten die Eltern ausgewählter Schüler:innen um Zustimmung (Ausflug, Schikurs, Fotos). Eine Antwort je Kind;
 * jeder verknüpfte Elternteil kann antworten und bis zur Frist ändern. Zettel-Antworten trägt die Lehrkraft nach.
 */
import { z } from 'zod';

export const CONSENT_ANSWERS = ['OPEN', 'YES', 'NO'] as const;
export type ConsentAnswer = (typeof CONSENT_ANSWERS)[number];

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const consentFormInput = z.object({
  title: z.string().trim().min(1).max(120),
  body: z.string().trim().min(1).max(5000),
  /** Letzter Tag für Antworten in der App (einschließlich); ohne Frist bis zum Schließen. */
  dueOn: isoDate.nullable().default(null),
  studentIds: z.array(z.string().min(1).max(64)).min(1).max(500),
});
export type ConsentFormInput = z.infer<typeof consentFormInput>;

/** Antwort der Eltern. */
export const consentAnswerInput = z.object({
  answer: z.enum(['YES', 'NO']),
  note: z.string().trim().max(500).nullable().default(null),
});

/** Nachtrag einer Antwort auf Papier durch die Lehrkraft (OPEN nimmt den Nachtrag zurück). */
export const consentPaperInput = z.object({ answer: z.enum(CONSENT_ANSWERS) });

export interface ConsentCounts {
  yes: number;
  no: number;
  open: number;
}

export interface ConsentFormItem {
  id: string;
  title: string;
  dueOn: string | null;
  createdAt: string;
  createdBy: string;
  /** Klassen der angefragten Schüler:innen, z. B. ["3A", "3B"]. */
  classes: string[];
  closed: boolean;
  counts: ConsentCounts;
}

export interface ConsentFormRow {
  studentId: string;
  name: string;
  className: string;
  answer: ConsentAnswer;
  note: string | null;
  answeredBy: string | null;
  answeredAt: string | null;
  onPaper: boolean;
  /** Verknüpfte Eltern mit Konto; 0 = nur auf Papier möglich. */
  guardians: number;
}

export interface ConsentFormDetail extends ConsentFormItem {
  body: string;
  mine: boolean;
  remindedAt: string | null;
  rows: ConsentFormRow[];
}

export interface ConsentFormOptions {
  classes: {
    id: string;
    name: string;
    students: { id: string; name: string; guardians: number }[];
  }[];
}

/** Sicht der Eltern: je Erklärung die eigenen Kinder mit Antwort. */
export interface MyConsentForm {
  id: string;
  title: string;
  body: string;
  dueOn: string | null;
  createdAt: string;
  createdBy: string;
  /** Antworten nicht mehr möglich (geschlossen oder Frist vorbei). */
  closed: boolean;
  children: {
    studentId: string;
    firstName: string;
    answer: ConsentAnswer;
    note: string | null;
    answeredBy: string | null;
    answeredAt: string | null;
    onPaper: boolean;
  }[];
}

export const countAnswers = (rows: readonly { answer: ConsentAnswer }[]): ConsentCounts => ({
  yes: rows.filter((r) => r.answer === 'YES').length,
  no: rows.filter((r) => r.answer === 'NO').length,
  open: rows.filter((r) => r.answer === 'OPEN').length,
});

/** Antworten in der App möglich: nicht geschlossen und Frist (einschließlich) nicht vorbei. */
export const consentOpen = (f: { closedAt: string | null; dueOn: string | null }, today: string) =>
  f.closedAt === null && (f.dueOn === null || f.dueOn >= today);
