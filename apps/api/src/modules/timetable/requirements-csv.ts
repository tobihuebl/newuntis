/**
 * Lehrfächerverteilung als CSV (M7): je Zeile Klasse oder Gruppe, Fach, Lehrkraft, Wochenstunden und optional
 * Doppelstunde. Reine Logik, Vorschau und Übernehmen teilen dieselbe Prüfung (wie beim Personen-Import, ADR 0005).
 */
import { cleanText, normalizeKey, parseCsv } from '../admin/csv';

export interface RequirementDirectory {
  teachers: { id: string; firstName: string; lastName: string; email: string | null }[];
  subjects: { id: string; name: string; code: string }[];
  classes: { id: string; name: string }[];
  groups: { id: string; name: string }[];
}

export interface RequirementRow {
  line: number;
  classId: string | null;
  groupId: string | null;
  subjectId: string | null;
  teacherId: string | null;
  hoursPerWeek: number | null;
  preferDouble: boolean;
  /** Was in der Datei stand (für die Vorschau). */
  raw: { who: string; subject: string; teacher: string; hours: string };
  errors: string[];
}

const ALIASES: Record<'klasse' | 'gruppe' | 'fach' | 'lehrkraft' | 'stunden' | 'doppel', string[]> =
  {
    klasse: ['klasse', 'class'],
    gruppe: ['gruppe', 'group', 'kurs'],
    fach: ['fach', 'gegenstand', 'fachkuerzel', 'kuerzel', 'subject'],
    lehrkraft: [
      'lehrkraft',
      'lehrer',
      'lehrerin',
      'lehrperson',
      'teacher',
      'email',
      'lehrkraftemail',
    ],
    stunden: ['stunden', 'wochenstunden', 'wstd', 'std', 'hours'],
    doppel: ['doppelstunde', 'doppel', 'doppelstunden', 'double'],
  };

const yes = (s: string) => /^(ja|j|x|1|true|yes|y)$/i.test(s.trim());

export function parseRequirementsCsv(
  text: string,
  dir: RequirementDirectory,
): {
  rows: RequirementRow[];
  missingColumns: string[];
} {
  const parsed = parseCsv(cleanText(text));
  const col = (key: keyof typeof ALIASES) =>
    parsed.headers.findIndex((h) => ALIASES[key].includes(normalizeKey(h)));
  const idx = {
    klasse: col('klasse'),
    gruppe: col('gruppe'),
    fach: col('fach'),
    lehrkraft: col('lehrkraft'),
    stunden: col('stunden'),
    doppel: col('doppel'),
  };
  const missingColumns = [
    idx.klasse < 0 && idx.gruppe < 0 ? 'Klasse oder Gruppe' : null,
    idx.fach < 0 ? 'Fach' : null,
    idx.lehrkraft < 0 ? 'Lehrkraft' : null,
    idx.stunden < 0 ? 'Wochenstunden' : null,
  ].filter((x): x is string => x !== null);
  if (missingColumns.length) return { rows: [], missingColumns };

  const lc = (s: string) => s.trim().toLowerCase();
  const teacherOf = (s: string) => {
    const v = lc(s);
    if (!v) return null;
    const hits = dir.teachers.filter(
      (t) =>
        (t.email && lc(t.email) === v) ||
        lc(`${t.lastName} ${t.firstName}`) === v ||
        lc(`${t.firstName} ${t.lastName}`) === v ||
        lc(`${t.lastName}, ${t.firstName}`) === v ||
        lc(t.lastName) === v,
    );
    return hits.length === 1 ? hits[0]! : hits.length > 1 ? 'mehrdeutig' : null;
  };

  const rows = parsed.rows.map(({ line, cells }): RequirementRow => {
    const get = (k: keyof typeof idx) => (idx[k] >= 0 ? (cells[idx[k]] ?? '').trim() : '');
    const errors: string[] = [];
    const clsName = get('klasse');
    const grpName = get('gruppe');
    const cls = clsName ? dir.classes.find((c) => lc(c.name) === lc(clsName)) : undefined;
    const grp = grpName ? dir.groups.find((g) => lc(g.name) === lc(grpName)) : undefined;
    if (clsName && !cls) errors.push(`Klasse "${clsName}" unbekannt`);
    if (grpName && !grp) errors.push(`Gruppe "${grpName}" unbekannt`);
    if (!clsName && !grpName) errors.push('Klasse oder Gruppe fehlt');
    if (clsName && grpName) errors.push('Entweder Klasse oder Gruppe, nicht beides');
    const subj = get('fach');
    const subject = dir.subjects.find((s) => lc(s.code) === lc(subj) || lc(s.name) === lc(subj));
    if (!subject) errors.push(subj ? `Fach "${subj}" unbekannt` : 'Fach fehlt');
    const teacherText = get('lehrkraft');
    const teacher = teacherOf(teacherText);
    if (teacher === 'mehrdeutig')
      errors.push(`Lehrkraft "${teacherText}" ist nicht eindeutig (E-Mail angeben)`);
    else if (!teacher)
      errors.push(teacherText ? `Lehrkraft "${teacherText}" unbekannt` : 'Lehrkraft fehlt');
    const hoursText = get('stunden').replace(',', '.');
    const hours = Number(hoursText);
    if (!Number.isInteger(hours) || hours < 1 || hours > 30)
      errors.push('Wochenstunden: ganze Zahl von 1 bis 30');
    return {
      line,
      classId: cls?.id ?? null,
      groupId: grp?.id ?? null,
      subjectId: subject?.id ?? null,
      teacherId: teacher && teacher !== 'mehrdeutig' ? teacher.id : null,
      hoursPerWeek: errors.some((e) => e.startsWith('Wochenstunden')) ? null : hours,
      preferDouble: yes(get('doppel')),
      raw: { who: clsName || grpName, subject: subj, teacher: teacherText, hours: get('stunden') },
      errors,
    };
  });
  return { rows, missingColumns };
}
