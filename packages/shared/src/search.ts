/**
 * Globale Suche (PL-06): Strg/Cmd+K findet neben Seiten auch Personen, Klassen und Räume, je nach Rolle.
 * Schüler:innen und Eltern finden nur Seiten.
 */
import { z } from 'zod';

export const SEARCH_LIMIT = 8;

export const searchQuery = z.object({ q: z.string().trim().min(2).max(80) });

export const SEARCH_KINDS = ['person', 'teacher', 'student', 'class', 'room'] as const;
export type SearchKind = (typeof SEARCH_KINDS)[number];

export interface SearchResult {
  /** person = Stammdaten (Direktion, Administration); teacher/student = aus Sicht einer Lehrkraft. */
  kind: SearchKind;
  id: string;
  label: string;
  /** Zusatz, z. B. die Klasse einer Schülerin oder die Art der Person. */
  detail: string | null;
  personKind?: 'STUDENT' | 'TEACHER' | 'GUARDIAN' | 'STAFF';
  href: string;
}
