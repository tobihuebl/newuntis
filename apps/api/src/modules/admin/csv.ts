import { parse } from 'csv-parse/sync';
import { IMPORT_ALIASES, IMPORT_FIELDS, type ImportField } from '@sp/shared';

export type Delimiter = ',' | ';' | '\t';

/** Entfernt BOM und vereinheitlicht Zeilenenden. */
export function cleanText(text: string): string {
  const withoutBom = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  return withoutBom.replace(/\r\n?/g, '\n');
}

/** Erkennt das Trennzeichen an der ersten nichtleeren Zeile (Excel in Österreich exportiert meist mit Semikolon). */
export function detectDelimiter(text: string): Delimiter {
  const first = text.split('\n').find((l) => l.trim() !== '') ?? '';
  let inQuotes = false;
  const count: Record<string, number> = { ',': 0, ';': 0, '\t': 0 };
  for (const ch of first) {
    if (ch === '"') inQuotes = !inQuotes;
    else if (!inQuotes && ch in count) count[ch]!++;
  }
  const best = (Object.entries(count) as [Delimiter, number][]).sort((a, b) => b[1] - a[1])[0]!;
  return best[1] > 0 ? best[0] : ';';
}

/** Kleinschreibung, Umlaute aufgelöst, nur Buchstaben und Ziffern: "Schüler-Nr." -> "schuelernr". */
export function normalizeKey(s: string): string {
  return s
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

export interface ParsedCsv {
  delimiter: Delimiter;
  headers: string[];
  rows: { line: number; cells: string[] }[];
}

export function parseCsv(text: string, delimiter?: Delimiter): ParsedCsv {
  const clean = cleanText(text);
  const d = delimiter ?? detectDelimiter(clean);
  const records: string[][] = parse(clean, {
    delimiter: d,
    relax_quotes: true,
    relax_column_count: true,
    skip_empty_lines: true,
    trim: true,
  });
  const [headers = [], ...body] = records;
  // Zeilennummer = Zeile in der Datei (Kopfzeile ist Zeile 1; leere Zeilen werden bei der Zählung ignoriert)
  return { delimiter: d, headers, rows: body.map((cells, i) => ({ line: i + 2, cells })) };
}

/** Ordnet kanonische Felder den Spalten zu: ausdrückliche Zuordnung vor automatischer Erkennung über Aliase. */
export function mapHeaders(
  headers: string[],
  explicit: Partial<Record<ImportField, string>> = {},
): Partial<Record<ImportField, string>> {
  const result: Partial<Record<ImportField, string>> = {};
  const used = new Set<string>();
  for (const field of IMPORT_FIELDS) {
    const chosen = explicit[field];
    if (chosen && headers.includes(chosen)) {
      result[field] = chosen;
      used.add(chosen);
    }
  }
  for (const field of IMPORT_FIELDS) {
    if (result[field]) continue;
    for (const alias of IMPORT_ALIASES[field]) {
      const hit = headers.find((h) => !used.has(h) && normalizeKey(h) === alias);
      if (hit) {
        result[field] = hit;
        used.add(hit);
        break;
      }
    }
  }
  return result;
}

const KIND_WORDS: Record<string, 'STUDENT' | 'TEACHER' | 'GUARDIAN'> = {
  schueler: 'STUDENT',
  schuelerin: 'STUDENT',
  schuelerinnen: 'STUDENT',
  student: 'STUDENT',
  studentin: 'STUDENT',
  s: 'STUDENT',
  lehrer: 'TEACHER',
  lehrerin: 'TEACHER',
  lehrkraft: 'TEACHER',
  lehrperson: 'TEACHER',
  teacher: 'TEACHER',
  l: 'TEACHER',
  eltern: 'GUARDIAN',
  elternteil: 'GUARDIAN',
  erziehungsberechtigte: 'GUARDIAN',
  erziehungsberechtigter: 'GUARDIAN',
  mutter: 'GUARDIAN',
  vater: 'GUARDIAN',
  guardian: 'GUARDIAN',
  parent: 'GUARDIAN',
  e: 'GUARDIAN',
};
export function parseKind(s: string): 'STUDENT' | 'TEACHER' | 'GUARDIAN' | null {
  return KIND_WORDS[normalizeKey(s)] ?? null;
}

/** Akzeptiert YYYY-MM-DD und TT.MM.JJJJ; prüft, ob das Datum existiert. */
export function parseDate(s: string): string | null {
  let y: number, m: number, d: number;
  let hit = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
  if (hit) [y, m, d] = [Number(hit[1]), Number(hit[2]), Number(hit[3])] as [number, number, number];
  else if ((hit = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(s)))
    [d, m, y] = [Number(hit[1]), Number(hit[2]), Number(hit[3])] as [number, number, number];
  else return null;
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d)
    return null;
  return date.toISOString().slice(0, 10);
}

/** Schülernummern eines Elternteils: durch Semikolon, Komma, Schrägstrich, senkrechten Strich oder Leerzeichen getrennt. */
export function splitIds(s: string): string[] {
  return s
    .split(/[;,|/\s]+/)
    .map((x) => x.trim())
    .filter(Boolean);
}

export const nameKey = (first: string, last: string): string =>
  `${normalizeKey(first)}|${normalizeKey(last)}`;
