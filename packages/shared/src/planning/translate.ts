/**
 * Planungswünsche in Worten (M7, ADR 0012): regelbasierter Übersetzer für typische Sätze. Läuft immer (auch ohne
 * KI-Schlüssel und in Tests); was er nicht versteht, landet in `unresolved` und kann optional an die KI gehen.
 * Ergebnis sind Vorschläge, die die Administration vor dem Speichern bestätigt.
 */
import type { PlanningConstraintInput } from './constraints';

export interface TranslateDirectory {
  teachers: { id: string; firstName: string; lastName: string }[];
  subjects: { id: string; name: string; code: string }[];
  classes: { id: string; name: string }[];
  rooms: { id: string; name: string }[];
  /** Höchste Stundennummer im Raster (für "nur bis zur 4. Stunde"). */
  maxPeriod: number;
}

export interface TranslateResult {
  proposals: { sentence: string; constraint: PlanningConstraintInput }[];
  unresolved: string[];
}

const WEEKDAYS: [RegExp, number][] = [
  [/\bmo(ntags?|\.)?\b/, 1],
  [/\bdi(enstags?|\.)?\b/, 2],
  [/\bmi(ttwochs?|\.)?\b/, 3],
  [/\bdo(nnerstags?|\.)?\b/, 4],
  [/\bfr(eitags?|\.)?\b/, 5],
];
const ORDINALS: Record<string, number> = {
  ersten: 1,
  erste: 1,
  zweiten: 2,
  zweite: 2,
  dritten: 3,
  dritte: 3,
  vierten: 4,
  vierte: 4,
  fünften: 5,
  fünfte: 5,
  sechsten: 6,
  sechste: 6,
  siebten: 7,
  siebte: 7,
  achten: 8,
  achte: 8,
};
/** Umgangssprachliche Fachnamen → Suchwörter für Fachname oder Kürzel. */
const SUBJECT_SYNONYMS: Record<string, string[]> = {
  turnen: ['sport', 'bewegung', 'bsp', 'tu'],
  sport: ['sport', 'bewegung', 'bsp'],
  mathe: ['mathematik', 'm'],
  bio: ['biologie', 'bu'],
  geschichte: ['geschichte', 'gsp'],
  geo: ['geografie', 'geographie', 'gw'],
  musik: ['musik', 'me', 'mu'],
  zeichnen: ['bildnerische', 'kunst', 'be'],
  werken: ['werken', 'tex', 'tec'],
  reli: ['religion', 'rk', 're'],
};

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();

/** Sätze trennen: Zeilen, Strichpunkt, Satzende (aber nicht "1. Stunde"). */
export function splitSentences(text: string): string[] {
  return text
    .split(/\n|;|(?<!\d)\.(?=\s|$)/)
    .map((s) => s.trim())
    .filter((s) => s.length > 2);
}

function weekdayOf(s: string): number | null {
  for (const [re, n] of WEEKDAYS) if (re.test(s)) return n;
  return null;
}

/** Stundennummern in einem Satzteil: "1. Stunde", "ersten Stunde", "1. und 2. Stunde". */
function periodNumbers(s: string): number[] {
  const out = new Set<number>();
  for (const m of s.matchAll(/(\d{1,2})\.(?=\s*(?:und|,|bis|oder|stunde))/g)) out.add(Number(m[1]));
  for (const [word, n] of Object.entries(ORDINALS))
    if (new RegExp(`\\b${word}\\b`).test(s)) out.add(n);
  return [...out].sort((a, b) => a - b);
}

function findTeacher(s: string, dir: TranslateDirectory) {
  // Längste Treffer zuerst ("Anna Huber" vor "Huber"), nur ganze Wörter
  const hits = dir.teachers.filter((t) => {
    const last = norm(t.lastName);
    return new RegExp(`(^|[^a-zäöüß])${last}([^a-zäöüß]|$)`).test(s);
  });
  if (hits.length === 1) return hits[0]!;
  const full = hits.filter((t) => s.includes(norm(`${t.firstName} ${t.lastName}`)));
  return full.length === 1 ? full[0]! : null;
}

function findSubject(s: string, dir: TranslateDirectory) {
  const words = s.split(/[^a-zäöüß0-9]+/).filter(Boolean);
  for (const w of words) {
    const keys = SUBJECT_SYNONYMS[w] ?? [w];
    const hit = dir.subjects.find((sub) =>
      keys.some((k) => norm(sub.code) === k || (k.length > 3 && norm(sub.name).includes(k))),
    );
    if (hit) return hit;
  }
  return null;
}

const findClass = (s: string, dir: TranslateDirectory) =>
  dir.classes.find((c) => new RegExp(`(^|\\s)${norm(c.name)}(\\s|$|[,.])`).test(s)) ?? null;

const findRoom = (s: string, dir: TranslateDirectory) =>
  [...dir.rooms]
    .sort((a, b) => b.name.length - a.name.length)
    .find((r) => s.includes(norm(r.name))) ?? null;

/** "möglichst", "wenn möglich", "lieber", "nach Möglichkeit" → weicher Wunsch. */
const isSoft = (s: string) => /möglichst|wenn möglich|lieber|nach möglichkeit|wenn es geht/.test(s);

function translateSentence(
  sentence: string,
  dir: TranslateDirectory,
): PlanningConstraintInput[] | null {
  const s = norm(sentence);
  const hard = !isSoft(s);
  const base = {
    hard,
    active: true,
    roomIds: [],
    periods: [],
    source: 'TEXT' as const,
    text: sentence,
  };
  const teacher = findTeacher(s, dir);
  const wd = weekdayOf(s);
  const max = s.match(/(höchstens|maximal|max\.?|nicht mehr als)\s*(\d{1,2})\s*(stunden|std)/);

  // Hohlstunden
  if (/hohlstunde/.test(s) && /kein|vermeid|ohne/.test(s))
    return [
      {
        ...base,
        kind: 'NO_STUDENT_GAPS',
        teacherId: null,
        classId: null,
        subjectId: null,
        weekday: null,
        max: null,
      },
    ];

  // Höchststunden je Tag
  if (max) {
    const n = Number(max[2]);
    if (teacher)
      return [
        {
          ...base,
          kind: 'TEACHER_MAX_PER_DAY',
          teacherId: teacher.id,
          classId: null,
          subjectId: null,
          weekday: null,
          max: n,
        },
      ];
    const cls = findClass(s, dir);
    if (cls || /klasse|schüler/.test(s))
      return [
        {
          ...base,
          kind: 'CLASS_MAX_PER_DAY',
          teacherId: null,
          classId: cls?.id ?? null,
          subjectId: null,
          weekday: null,
          max: n,
        },
      ];
  }

  // Lehrkraft nicht verfügbar
  if (teacher && wd !== null) {
    const nums = periodNumbers(s);
    if (
      /\bfrei\b|nicht da|nicht verfügbar|kann nicht|keinen unterricht|ganz(en)? tag/.test(s) &&
      !/ab der|bis zur/.test(s)
    )
      return [
        {
          ...base,
          kind: 'TEACHER_UNAVAILABLE',
          teacherId: teacher.id,
          classId: null,
          subjectId: null,
          weekday: wd,
          max: null,
          periods: nums.length && !/frei\b/.test(s) ? nums : [],
        },
      ];
    const from = s.match(/(erst )?ab (der )?(\d{1,2})\.|erst ab der (\w+)/);
    if (from) {
      const n = Number(from[3] ?? ORDINALS[from[4] ?? ''] ?? 0);
      if (n > 1)
        return [
          {
            ...base,
            kind: 'TEACHER_UNAVAILABLE',
            teacherId: teacher.id,
            classId: null,
            subjectId: null,
            weekday: wd,
            max: null,
            periods: Array.from({ length: n - 1 }, (_, i) => i + 1),
          },
        ];
    }
    const until = s.match(/(nur )?bis (zur )?(\d{1,2})\./);
    if (until) {
      const n = Number(until[3]);
      if (n < dir.maxPeriod)
        return [
          {
            ...base,
            kind: 'TEACHER_UNAVAILABLE',
            teacherId: teacher.id,
            classId: null,
            subjectId: null,
            weekday: wd,
            max: null,
            periods: Array.from({ length: dir.maxPeriod - n }, (_, i) => n + 1 + i),
          },
        ];
    }
    if (/nicht/.test(s) && nums.length)
      return [
        {
          ...base,
          kind: 'TEACHER_UNAVAILABLE',
          teacherId: teacher.id,
          classId: null,
          subjectId: null,
          weekday: wd,
          max: null,
          periods: nums,
        },
      ];
  }

  const subject = findSubject(s, dir);
  // Fach nicht in bestimmten Stunden
  if (subject && /nicht/.test(s)) {
    const nums = periodNumbers(s);
    const last = /letzten stunde/.test(s) ? [dir.maxPeriod] : [];
    const periods = [...new Set([...nums, ...last])];
    if (periods.length)
      return [
        {
          ...base,
          kind: 'SUBJECT_NOT_PERIODS',
          teacherId: null,
          classId: null,
          subjectId: subject.id,
          weekday: wd,
          max: null,
          periods,
        },
      ];
  }
  // Fachräume
  const room = findRoom(s, dir);
  if (subject && room && /\b(im|in der|in den|nur im|immer im|raum)\b/.test(s))
    return [
      {
        ...base,
        kind: 'SUBJECT_ROOMS',
        teacherId: null,
        classId: null,
        subjectId: subject.id,
        weekday: null,
        max: null,
        roomIds: [room.id],
      },
    ];
  // Stammraum
  const cls = findClass(s, dir);
  if (cls && room && /stammraum|klassenraum|klassenzimmer/.test(s))
    return [
      {
        ...base,
        kind: 'CLASS_HOME_ROOM',
        teacherId: null,
        classId: cls.id,
        subjectId: null,
        weekday: null,
        max: null,
        roomIds: [room.id],
      },
    ];
  return null;
}

export function translateWishes(text: string, dir: TranslateDirectory): TranslateResult {
  const proposals: TranslateResult['proposals'] = [];
  const unresolved: string[] = [];
  for (const sentence of splitSentences(text)) {
    const r = translateSentence(sentence, dir);
    if (r) for (const constraint of r) proposals.push({ sentence, constraint });
    else unresolved.push(sentence);
  }
  return { proposals, unresolved };
}
