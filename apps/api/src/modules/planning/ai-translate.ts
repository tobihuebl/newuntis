/**
 * Wünsche in Worten über ein KI-Modell (ADR 0012): Vercel AI Gateway, OpenAI-kompatible Schnittstelle, fest auf
 * die EU-Region (`inferenceRegion`) und Zero Data Retention gestellt. Das Modell sieht nur Kürzel: Namen von
 * Lehrkräften werden vor dem Senden durch L01, L02 … ersetzt, alle übrigen bekannten Personennamen durch
 * "[Person]". Die Antwort wird gegen das Schema und die Stammdaten geprüft; was nicht passt, bleibt ungelöst.
 */
import {
  CONSTRAINT_KINDS,
  planningConstraintInput,
  type PlanningConstraintInput,
  type TranslateDirectory,
} from '@sp/shared';
import { z } from 'zod';

export const GATEWAY_URL = 'https://ai-gateway.vercel.sh/v1/chat/completions';

export interface AiTranslateOptions {
  apiKey: string;
  model: string;
  sentences: string[];
  dir: TranslateDirectory;
  /** Weitere Personennamen der Schule (Schüler:innen, Eltern), die nie hinausgehen dürfen. */
  otherNames: string[];
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

export interface AiTranslateResult {
  proposals: { sentence: string; constraint: PlanningConstraintInput }[];
  unresolved: string[];
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Ersetzt Namen durch Kürzel; liefert Text und Zuordnung Kürzel → Lehrkraft-Id. */
export function pseudonymize(
  text: string,
  teachers: TranslateDirectory['teachers'],
  otherNames: string[],
): { text: string; codes: Map<string, string> } {
  const codes = new Map<string, string>();
  let out = text;
  // Anrede wird mitersetzt. Kürzel nach Reihenfolge der Liste, ersetzt wird aber lange Namen zuerst ("Anna Huber" vor "Huber")
  const coded = teachers.map((t, i) => ({ t, code: `L${String(i + 1).padStart(2, '0')}` }));
  coded.sort((a, b) => b.t.lastName.length - a.t.lastName.length);
  coded.forEach(({ t, code }) => {
    const re = new RegExp(
      `(?<!\\p{L})(?:(?:frau|herr|fr\\.|hr\\.)\\s+)?(?:${escape(t.firstName)}\\s+)?${escape(t.lastName)}(?!\\p{L})`,
      'giu',
    );
    if (re.test(out)) {
      out = out.replace(re, code);
      codes.set(code, t.id);
    }
  });
  for (const name of [...otherNames].sort((a, b) => b.length - a.length))
    if (name.length > 2)
      out = out.replace(new RegExp(`(?<!\\p{L})${escape(name)}(?!\\p{L})`, 'giu'), '[Person]');
  return { text: out, codes };
}

const aiItem = z.object({
  sentence: z.string(),
  kind: z.enum(CONSTRAINT_KINDS),
  hard: z.boolean().default(true),
  teacher: z.string().nullish(),
  class: z.string().nullish(),
  subject: z.string().nullish(),
  rooms: z.array(z.string()).default([]),
  weekday: z.number().int().min(1).max(5).nullish(),
  periods: z.array(z.number().int()).default([]),
  max: z.number().int().nullish(),
});
const aiResponse = z.object({
  items: z.array(aiItem).default([]),
  unresolved: z.array(z.string()).default([]),
});

function systemPrompt(dir: TranslateDirectory, teacherCodes: string[]) {
  return [
    'Du übersetzt Planungswünsche einer österreichischen Schule für einen Stundenplan-Solver in JSON.',
    'Antworte nur mit einem JSON-Objekt: {"items":[…],"unresolved":[…]}.',
    'Jedes Item: {"sentence": Originalsatz, "kind": Art, "hard": true|false, "teacher": Kürzel|null, "class": Klassenname|null, "subject": Fachkürzel|null, "rooms": [Raumnamen], "weekday": 1-5|null, "periods": [Stundennummern], "max": Zahl|null}.',
    `Arten: ${CONSTRAINT_KINDS.join(', ')}.`,
    'TEACHER_UNAVAILABLE: Lehrkraft an einem Wochentag nicht da (periods leer = ganzer Tag). TEACHER_MAX_PER_DAY und CLASS_MAX_PER_DAY: max = Höchststunden je Tag. SUBJECT_ROOMS: Fach nur in diesen Räumen. CLASS_HOME_ROOM: Stammraum einer Klasse (genau ein Raum). SUBJECT_NOT_PERIODS: Fach nicht in diesen Stunden. NO_STUDENT_GAPS: keine Hohlstunden.',
    '"möglichst", "wenn möglich", "lieber" bedeutet hard=false. Nichts erfinden: Was nicht eindeutig passt, kommt in "unresolved".',
    `Lehrkräfte (nur Kürzel): ${teacherCodes.join(', ') || 'keine'}.`,
    `Fächer: ${dir.subjects.map((s) => `${s.code}=${s.name}`).join('; ')}.`,
    `Klassen: ${dir.classes.map((c) => c.name).join(', ')}.`,
    `Räume: ${dir.rooms.map((r) => r.name).join(', ')}.`,
    `Stunden: 1 bis ${dir.maxPeriod}. Wochentage: 1=Montag bis 5=Freitag.`,
  ].join('\n');
}

export async function translateWithAi(o: AiTranslateOptions): Promise<AiTranslateResult> {
  const fetchImpl = o.fetchImpl ?? fetch;
  const pseudo = o.sentences.map((s) => pseudonymize(s, o.dir.teachers, o.otherNames));
  const codes = new Map<string, string>();
  for (const p of pseudo) for (const [k, v] of p.codes) codes.set(k, v);
  const byPseudo = new Map(pseudo.map((p, i) => [p.text, o.sentences[i]!]));

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), o.timeoutMs ?? 20_000);
  let body: unknown;
  try {
    const res = await fetchImpl(GATEWAY_URL, {
      method: 'POST',
      signal: controller.signal,
      headers: { Authorization: `Bearer ${o.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: o.model,
        temperature: 0,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: systemPrompt(o.dir, [...codes.keys()]) },
          { role: 'user', content: pseudo.map((p) => p.text).join('\n') },
        ],
        providerOptions: {
          gateway: {
            inferenceRegion: { scope: 'zone', geoRegion: 'eu' },
            zeroDataRetention: true,
          },
        },
      }),
    });
    if (!res.ok) return { proposals: [], unresolved: o.sentences };
    body = await res.json();
  } catch {
    return { proposals: [], unresolved: o.sentences };
  } finally {
    clearTimeout(timer);
  }

  const choice = (
    body as {
      choices?: {
        message?: {
          content?: string;
          provider_metadata?: {
            gateway?: {
              routing?: {
                modelAttempts?: {
                  providerAttempts?: { inferenceEndpoint?: { geoRegion?: string } | null }[];
                }[];
              };
            };
          };
        };
      }[];
    }
  ).choices?.[0]?.message;
  // Nur verwenden, wenn das Gateway bestätigt, dass in der EU gerechnet wurde (sofern es die Angabe liefert)
  const regions = (choice?.provider_metadata?.gateway?.routing?.modelAttempts ?? [])
    .flatMap((m) => m.providerAttempts ?? [])
    .map((p) => p.inferenceEndpoint?.geoRegion)
    .filter(Boolean);
  if (regions.some((r) => r !== 'eu')) return { proposals: [], unresolved: o.sentences };

  let parsed: z.infer<typeof aiResponse>;
  try {
    parsed = aiResponse.parse(JSON.parse(choice?.content ?? '{}'));
  } catch {
    return { proposals: [], unresolved: o.sentences };
  }

  const subject = (code: string | null | undefined) =>
    code
      ? (o.dir.subjects.find((s) => s.code.toLowerCase() === code.toLowerCase())?.id ?? undefined)
      : null;
  const cls = (name: string | null | undefined) =>
    name
      ? (o.dir.classes.find((c) => c.name.toLowerCase() === name.toLowerCase())?.id ?? undefined)
      : null;
  const room = (name: string) =>
    o.dir.rooms.find((r) => r.name.toLowerCase() === name.toLowerCase())?.id;

  const proposals: AiTranslateResult['proposals'] = [];
  const handled = new Set<string>();
  for (const item of parsed.items) {
    const original = byPseudo.get(item.sentence) ?? item.sentence;
    if (!o.sentences.includes(original)) continue; // nur Sätze, die wir geschickt haben
    const teacherId = item.teacher ? codes.get(item.teacher) : null;
    const subjectId = subject(item.subject);
    const classId = cls(item.class);
    const roomIds = item.rooms.map(room);
    if (
      teacherId === undefined ||
      subjectId === undefined ||
      classId === undefined ||
      roomIds.some((r) => !r)
    )
      continue; // unbekannte Kürzel: lieber offen lassen als raten
    const candidate = planningConstraintInput.safeParse({
      kind: item.kind,
      hard: item.hard,
      teacherId,
      classId,
      subjectId,
      roomIds,
      weekday: item.weekday ?? null,
      periods: item.periods.filter((p) => p >= 1 && p <= o.dir.maxPeriod),
      max: item.max ?? null,
      source: 'AI',
      text: original,
    });
    if (!candidate.success) continue;
    proposals.push({ sentence: original, constraint: candidate.data });
    handled.add(original);
  }
  return { proposals, unresolved: o.sentences.filter((s) => !handled.has(s)) };
}
