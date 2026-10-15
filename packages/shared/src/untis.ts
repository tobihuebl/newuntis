/**
 * Untis-Import (SD-06, ADR 0023): Untis exportiert Stammdaten und Stundenplan als DIF-Textdateien (GPU001 bis
 * GPU021, Feldreihenfolge laut Untis-Handbuch "Allgemeine Schnittstellen"). Hier steckt nur die reine Leselogik:
 * Zeilen lesen, Stundenplan zu Unterrichtsstunden zusammenfassen (Kopplungen, Teamteaching, Doppelstunden),
 * Lehrfächerverteilung ableiten. Die Zuordnung zu Datenbank-Einträgen macht die API.
 */
import { z } from 'zod';

// ───────────────────────── Eingabe ─────────────────────────

/** Untis-Dateien sind klein (Stundenplan einer Schule meist unter 500 KB); die Anfrage darf insgesamt 6 MB haben. */
const file = z.string().max(3_000_000);
export const untisImportInput = z.object({
  schoolYearId: z.string().min(1).max(64),
  /** Name des neuen Entwurfs, z. B. "Untis 2026/27". */
  name: z.string().trim().min(1).max(80).default('Import aus Untis'),
  files: z.object({
    /** GPU001.TXT Stundenplan (Pflicht). */
    gpu001: file.min(1),
    /** GPU002.TXT Unterricht: Lehrfächerverteilung (Soll-Stunden). */
    gpu002: file.optional(),
    /** GPU004.TXT Lehrkräfte: Namen und E-Mail-Adressen. */
    gpu004: file.optional(),
    /** GPU005.TXT Räume: Kapazität. */
    gpu005: file.optional(),
    /** GPU006.TXT Fächer: Langnamen. */
    gpu006: file.optional(),
  }),
});
export type UntisImportInput = z.infer<typeof untisImportInput>;

// ───────────────────────── DIF lesen ─────────────────────────

/**
 * Liest eine DIF-Datei: Felder durch Komma (oder Semikolon, Tabulator) getrennt, Text in doppelten
 * Anführungszeichen ("" = Anführungszeichen im Text). Leere Zeilen fallen weg.
 */
export function parseDif(text: string): string[][] {
  const clean = (text.charCodeAt(0) === 0xfeff ? text.slice(1) : text).replace(/\r\n?/g, '\n');
  const first = clean.split('\n').find((l) => l.trim() !== '') ?? '';
  const count = (ch: string) => {
    let inQ = false;
    let n = 0;
    for (const c of first) {
      if (c === '"') inQ = !inQ;
      else if (!inQ && c === ch) n++;
    }
    return n;
  };
  const delimiter = [',', ';', '\t'].sort((a, b) => count(b) - count(a))[0]!;
  const rows: string[][] = [];
  for (const line of clean.split('\n')) {
    if (line.trim() === '') continue;
    const cells: string[] = [];
    let cur = '';
    let inQ = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i]!;
      if (inQ) {
        if (c === '"' && line[i + 1] === '"') {
          cur += '"';
          i++;
        } else if (c === '"') inQ = false;
        else cur += c;
      } else if (c === '"') inQ = true;
      else if (c === delimiter) {
        cells.push(cur.trim());
        cur = '';
      } else cur += c;
    }
    cells.push(cur.trim());
    rows.push(cells);
  }
  return rows;
}

const at = (r: string[], i: number) => (r[i] ?? '').trim();
const int = (s: string) => (/^\d+$/.test(s) ? Number(s) : null);
/** Untis schreibt Dezimalzahlen je nach Einstellung mit Punkt oder Komma. */
const num = (s: string) => {
  const n = Number(s.replace(',', '.'));
  return s !== '' && Number.isFinite(n) ? n : null;
};

export interface UntisSlot {
  line: number;
  lessonNo: string;
  className: string;
  teacher: string;
  subject: string;
  room: string;
  /** 1 = Montag … 7 = Sonntag */
  day: number;
  period: number;
}

/** GPU001.TXT Stundenplan: 1 Unt-Nr, 2 Klasse, 3 Lehrer, 4 Fach, 5 Raum, 6 Tag, 7 Stunde, 8 Stundenlänge. */
export function readTimetable(rows: string[][]): { slots: UntisSlot[]; invalid: number[] } {
  const slots: UntisSlot[] = [];
  const invalid: number[] = [];
  rows.forEach((r, i) => {
    const day = int(at(r, 5));
    const period = int(at(r, 6));
    if (!at(r, 0) || day === null || period === null) {
      invalid.push(i + 1);
      return;
    }
    slots.push({
      line: i + 1,
      lessonNo: at(r, 0),
      className: at(r, 1),
      teacher: at(r, 2),
      subject: at(r, 3),
      room: at(r, 4),
      day,
      period,
    });
  });
  return { slots, invalid };
}

export interface UntisLessonRow {
  lessonNo: string;
  hours: number | null;
  className: string;
  teacher: string;
  subject: string;
}

/** GPU002.TXT Unterricht: 1 Unt-Nr, 2 Wochenstunden, 5 Klasse, 6 Lehrer, 7 Fach. */
export function readLessons(rows: string[][]): UntisLessonRow[] {
  return rows
    .filter((r) => at(r, 0) !== '')
    .map((r) => ({
      lessonNo: at(r, 0),
      hours: num(at(r, 1)),
      className: at(r, 4),
      teacher: at(r, 5),
      subject: at(r, 6),
    }));
}

export interface UntisTeacher {
  code: string;
  lastName: string;
  firstName: string;
  email: string;
}

/** GPU004.TXT Lehrer: 1 Kurzname, 2 Langname (Nachname), 29 Vorname, 33 E-Mail. */
export function readTeachers(rows: string[][]): UntisTeacher[] {
  return rows
    .filter((r) => at(r, 0) !== '')
    .map((r) => ({
      code: at(r, 0),
      lastName: at(r, 1),
      firstName: at(r, 28),
      email: at(r, 32).toLowerCase(),
    }));
}

/** GPU005.TXT Räume: 1 Kurzname, 2 Langname, 8 Kapazität. */
export function readRooms(
  rows: string[][],
): { code: string; name: string; capacity: number | null }[] {
  return rows
    .filter((r) => at(r, 0) !== '')
    .map((r) => ({ code: at(r, 0), name: at(r, 1), capacity: int(at(r, 7)) }));
}

/** GPU006.TXT Fächer: 1 Kurzname, 2 Langname. */
export function readSubjects(rows: string[][]): { code: string; name: string }[] {
  return rows.filter((r) => at(r, 0) !== '').map((r) => ({ code: at(r, 0), name: at(r, 1) }));
}

// ───────────────────────── Zusammenfassen ─────────────────────────

/** Eine Unterrichtsstunde im neuen Entwurf (eine Klasse oder eine Gruppe aus gekoppelten Klassen). */
export interface UntisPlannedLesson {
  lessonNo: string;
  classes: string[];
  subject: string;
  teachers: string[];
  room: string | null;
  weekday: number;
  periodStart: number;
  periodCount: number;
}

export type UntisWarningKind =
  'invalidLine' | 'noClass' | 'noSubject' | 'weekend' | 'missingPeriod' | 'severalRooms';

export interface UntisWarning {
  kind: UntisWarningKind;
  /** Zeilennummern (gekürzt) bzw. Werte, auf die sich der Hinweis bezieht. */
  refs: string[];
  count: number;
}

/** Name der Gruppe für gekoppelte Klassen, z. B. "1A/1B RK". */
export const couplingName = (classes: readonly string[], subject: string) =>
  `${classes.join('/')} ${subject}`;

const sortNames = (a: string[]) =>
  [...new Set(a.filter(Boolean))].sort((x, y) => x.localeCompare(y, 'de', { numeric: true }));

/**
 * Stundenplan zu Unterrichtsstunden: Zeilen mit gleicher Unterrichtsnummer, Tag, Stunde und Fach bilden eine
 * Stunde (mehrere Klassen = Kopplung → Gruppe, mehrere Lehrkräfte = Teamteaching). Aufeinanderfolgende Stunden
 * mit gleicher Besetzung werden zur Doppelstunde. Samstag/Sonntag, Zeilen ohne Klasse oder Fach und Stunden, die
 * es im Raster nicht gibt, werden übersprungen und gemeldet.
 */
export function buildLessons(
  slots: readonly UntisSlot[],
  periods: readonly number[],
  invalidLines: readonly number[] = [],
): { lessons: UntisPlannedLesson[]; warnings: UntisWarning[] } {
  const warn = new Map<UntisWarningKind, Set<string>>();
  const add = (k: UntisWarningKind, ref: string) =>
    warn.set(k, (warn.get(k) ?? new Set()).add(ref));
  for (const l of invalidLines) add('invalidLine', String(l));
  const raster = new Set(periods);
  const cells = new Map<string, { slots: UntisSlot[] }>();
  for (const s of slots) {
    if (s.day > 5) {
      add('weekend', String(s.line));
      continue;
    }
    if (!s.className) {
      add('noClass', s.lessonNo);
      continue;
    }
    if (!s.subject) {
      add('noSubject', s.lessonNo);
      continue;
    }
    if (!raster.has(s.period)) {
      add('missingPeriod', String(s.period));
      continue;
    }
    const key = [s.lessonNo, s.day, s.period, s.subject].join('|');
    const c = cells.get(key) ?? { slots: [] };
    c.slots.push(s);
    cells.set(key, c);
  }
  const single = [...cells.values()].map(({ slots: ss }) => {
    const rooms = sortNames(ss.map((s) => s.room));
    if (rooms.length > 1) add('severalRooms', ss[0]!.lessonNo);
    return {
      lessonNo: ss[0]!.lessonNo,
      classes: sortNames(ss.map((s) => s.className)),
      subject: ss[0]!.subject,
      teachers: sortNames(ss.map((s) => s.teacher)),
      room: rooms[0] ?? null,
      weekday: ss[0]!.day,
      periodStart: ss[0]!.period,
      periodCount: 1,
    } satisfies UntisPlannedLesson;
  });
  const same = (a: UntisPlannedLesson, b: UntisPlannedLesson) =>
    a.lessonNo === b.lessonNo &&
    a.weekday === b.weekday &&
    a.subject === b.subject &&
    a.room === b.room &&
    a.classes.join('|') === b.classes.join('|') &&
    a.teachers.join('|') === b.teachers.join('|');
  single.sort(
    (a, b) =>
      a.lessonNo.localeCompare(b.lessonNo, 'de', { numeric: true }) ||
      a.weekday - b.weekday ||
      a.subject.localeCompare(b.subject) ||
      a.periodStart - b.periodStart,
  );
  const lessons: UntisPlannedLesson[] = [];
  for (const l of single) {
    const prev = lessons[lessons.length - 1];
    if (prev && same(prev, l) && prev.periodStart + prev.periodCount === l.periodStart)
      prev.periodCount++;
    else lessons.push({ ...l });
  }
  const warnings = [...warn.entries()].map(([kind, refs]) => ({
    kind,
    count: refs.size,
    refs: [...refs].slice(0, 8),
  }));
  return { lessons, warnings };
}

export interface UntisRequirement {
  classes: string[];
  subject: string;
  teacher: string;
  hoursPerWeek: number;
}

/**
 * Lehrfächerverteilung aus GPU002: je Unterrichtsnummer, Fach und Lehrkraft die Wochenstunden; mehrere Klassen
 * in einer Unterrichtsnummer sind eine Kopplung (Gruppe wie im Stundenplan). Halbe Stunden (14-tägig) werden
 * aufgerundet.
 */
export function buildRequirements(rows: readonly UntisLessonRow[]): UntisRequirement[] {
  const by = new Map<
    string,
    { classes: string[]; subject: string; teacher: string; hours: number }
  >();
  const lessonClasses = new Map<string, string[]>();
  // Klassen je Unterrichtsnummer und Fach: dieselbe Gruppierung wie im Stundenplan (buildLessons)
  const ck = (r: { lessonNo: string; subject: string }) => `${r.lessonNo}|${r.subject}`;
  for (const r of rows) {
    if (r.className) lessonClasses.set(ck(r), [...(lessonClasses.get(ck(r)) ?? []), r.className]);
  }
  for (const r of rows) {
    if (!r.teacher || !r.subject) continue;
    const key = [r.lessonNo, r.subject, r.teacher].join('|');
    const cur = by.get(key) ?? { classes: [], subject: r.subject, teacher: r.teacher, hours: 0 };
    cur.hours = Math.max(cur.hours, r.hours ?? 0);
    by.set(key, cur);
  }
  const out: UntisRequirement[] = [];
  for (const [key, v] of by) {
    const classes = sortNames(
      lessonClasses.get(ck({ lessonNo: key.split('|')[0]!, subject: v.subject })) ?? [],
    );
    if (classes.length === 0 || v.hours <= 0) continue;
    out.push({ classes, subject: v.subject, teacher: v.teacher, hoursPerWeek: Math.ceil(v.hours) });
  }
  return out.sort(
    (a, b) =>
      a.classes.join('/').localeCompare(b.classes.join('/'), 'de', { numeric: true }) ||
      a.subject.localeCompare(b.subject),
  );
}

// ───────────────────────── Vorschau ─────────────────────────

export type UntisMatch = 'existing' | 'email' | 'name' | 'new';

export interface UntisPreview {
  schoolYear: { id: string; name: string };
  validFrom: string;
  counts: {
    lessons: number;
    doubles: number;
    couplings: number;
    teamTeaching: number;
    requirements: number;
  };
  classes: { name: string; exists: boolean }[];
  /** Gruppen für gekoppelte Klassen (ohne Mitglieder; Zuordnung danach in der Gruppenverwaltung). */
  groups: { name: string; exists: boolean }[];
  subjects: { code: string; name: string; exists: boolean }[];
  rooms: { code: string; exists: boolean }[];
  teachers: { code: string; name: string; email: string | null; match: UntisMatch }[];
  warnings: UntisWarning[];
  /** Fehler verhindern die Übernahme (z. B. Raster fehlt). */
  errors: string[];
}

export interface UntisResult {
  versionId: string;
  lessons: number;
  requirements: number;
  created: { classes: number; groups: number; subjects: number; rooms: number; teachers: number };
}
