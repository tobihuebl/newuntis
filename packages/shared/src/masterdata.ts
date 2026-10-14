import { z } from 'zod';
import { emailSchema, passwordSchema } from './auth';

export const dateSchema = z.iso.date();
export const timeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Format HH:MM');
const trimmed = (max: number) => z.string().trim().min(1).max(max);
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((v) => (v === undefined || v === null || v === '' ? null : v));

// ───────────────────────── Schuljahr ─────────────────────────
export const schoolYearInput = z
  .object({
    name: trimmed(20),
    startsOn: dateSchema,
    endsOn: dateSchema,
    isCurrent: z.boolean().default(false),
  })
  .refine((v) => v.startsOn < v.endsOn, {
    message: 'Beginn muss vor dem Ende liegen',
    path: ['endsOn'],
  });
export const schoolYearPatch = z
  .object({ name: trimmed(20), startsOn: dateSchema, endsOn: dateSchema, isCurrent: z.boolean() })
  .partial();
export const freeDayInput = z
  .object({ fromDate: dateSchema, toDate: dateSchema, label: trimmed(80) })
  .refine((v) => v.fromDate <= v.toDate, {
    message: 'Von muss vor oder am Bis-Datum liegen',
    path: ['toDate'],
  });

// ───────────────────────── Raster, Fächer, Räume ─────────────────────────
export const periodInput = z
  .object({
    number: z.number().int().min(1).max(20),
    startTime: timeSchema,
    endTime: timeSchema,
    blocksDouble: z.boolean().default(false),
  })
  .refine((v) => v.startTime < v.endTime, {
    message: 'Ende muss nach dem Beginn liegen',
    path: ['endTime'],
  });
export const periodPatch = z
  .object({
    number: z.number().int().min(1).max(20),
    startTime: timeSchema,
    endTime: timeSchema,
    blocksDouble: z.boolean(),
  })
  .partial();

/**
 * Fächerfarben des Design Systems (Tokens fach-*, Text darauf immer on-fach). Die Zuordnung je Fach legt die
 * Schule fest; Amber ist Konflikten vorbehalten und deshalb keine Fächerfarbe.
 */
export const FACH_COLORS = [
  'kobalt',
  'mint',
  'himmel',
  'flieder',
  'rosa',
  'limette',
  'koralle',
  'sand',
] as const;
export type FachColor = (typeof FACH_COLORS)[number];

/** Standardzuordnung (Design System): Mathe Kobalt, Deutsch Koralle, Sprachen Rosa, Bio Mint, Physik/Chemie Himmel, Musik/Kunst Flieder, Sport Limette, sonst Sand. */
const DEFAULT_FACH: [RegExp, FachColor][] = [
  [/^(m|ma|mathe|mathematik)\b|mathemat/i, 'kobalt'],
  [/^(d|de)$|deutsch/i, 'koralle'],
  [/^(e|en|f|fr|l|la|it)$|englisch|franz|latein|spanisch|italienisch|sprache/i, 'rosa'],
  [/^(bio|biu|bu|nawi)$|biolog|naturkunde|umweltkunde/i, 'mint'],
  [/^(ph|ch)$|physik|chemie/i, 'himmel'],
  [/^(mu|me|be|bk|ku)$|musik|kunst|bildnerisch/i, 'flieder'],
  [/^(bsp|spo|bus)$|sport|bewegung|turnen/i, 'limette'],
];

export function defaultFachColor(name: string, code = ''): FachColor {
  for (const [re, color] of DEFAULT_FACH) if (re.test(code) || re.test(name)) return color;
  return 'sand';
}

/** Farbe eines Fachs: gespeicherte Fächerfarbe, sonst die Standardzuordnung. */
export function fachColorOf(subject: {
  color: string | null;
  name: string;
  code: string;
}): FachColor {
  return (FACH_COLORS as readonly string[]).includes(subject.color ?? '')
    ? (subject.color as FachColor)
    : defaultFachColor(subject.name, subject.code);
}

export const subjectInput = z.object({
  name: trimmed(80),
  code: trimmed(10),
  color: z
    .enum(FACH_COLORS, 'Eine der acht Fächerfarben wählen.')
    .nullish()
    .transform((v) => v ?? null),
});
export const subjectPatch = z
  .object({
    name: trimmed(80),
    code: trimmed(10),
    color: z.enum(FACH_COLORS).nullable(),
  })
  .partial();

export const roomInput = z.object({
  name: trimmed(60),
  capacity: z
    .number()
    .int()
    .min(1)
    .max(1000)
    .nullish()
    .transform((v) => v ?? null),
  kind: optionalText(40),
});
export const roomPatch = z
  .object({
    name: trimmed(60),
    capacity: z.number().int().min(1).max(1000).nullable(),
    kind: z.string().trim().max(40).nullable(),
  })
  .partial();

// ───────────────────────── Klassen, Gruppen ─────────────────────────
export const classInput = z.object({
  schoolYearId: z.string().min(1),
  name: trimmed(20),
  homeroomTeacherId: z
    .string()
    .min(1)
    .nullish()
    .transform((v) => v ?? null),
});
export const classPatch = z
  .object({ name: trimmed(20), homeroomTeacherId: z.string().min(1).nullable() })
  .partial();
export const groupInput = z.object({ schoolYearId: z.string().min(1), name: trimmed(60) });
export const groupPatch = z.object({ name: trimmed(60) }).partial();
export const groupMembersInput = z.object({
  studentIds: z.array(z.string().min(1)).min(1).max(500),
});

// ───────────────────────── Personen ─────────────────────────
export const PERSON_KINDS = ['STUDENT', 'TEACHER', 'GUARDIAN', 'STAFF'] as const;
export type PersonKindName = (typeof PERSON_KINDS)[number];
export const EXTRA_ROLES = ['PRINCIPAL', 'ADMIN'] as const;

export const personInput = z.object({
  kind: z.enum(PERSON_KINDS),
  firstName: trimmed(80),
  lastName: trimmed(80),
  birthDate: dateSchema.nullish().transform((v) => v ?? null),
  externalId: optionalText(40),
  email: emailSchema.nullish().transform((v) => v ?? null),
  /** Nur Schüler: Stammklasse (legt eine Einschreibung an). */
  classId: z
    .string()
    .min(1)
    .nullish()
    .transform((v) => v ?? null),
  /** Zusätzliche Rollen neben der Rolle aus `kind` (Klassenvorstand ergibt sich aus der Klasse). */
  extraRoles: z.array(z.enum(EXTRA_ROLES)).default([]),
});
export const personPatch = z
  .object({
    firstName: trimmed(80),
    lastName: trimmed(80),
    birthDate: dateSchema.nullable(),
    externalId: z.string().trim().max(40).nullable(),
    email: emailSchema.nullable(),
    classId: z.string().min(1).nullable(),
    extraRoles: z.array(z.enum(EXTRA_ROLES)),
  })
  .partial();
export const personListQuery = z.object({
  kind: z.enum(PERSON_KINDS).optional(),
  classId: z.string().min(1).optional(),
  q: z.string().trim().max(80).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.string().min(1).optional(),
});

// ───────────────────────── Lehrkräfte: Fächer und Stundenausmaß ─────────────────────────
const halfHours = (max: number) =>
  z
    .number()
    .min(0)
    .max(max)
    .refine((v) => Number.isInteger(v * 2), 'Nur ganze oder halbe Stunden');
export const teacherProfileInput = z
  .object({
    /** Fächer mit Lehrbefähigung (Lehrfächerverteilung, Supplier-Vorschläge). */
    subjectIds: z
      .array(z.string().min(1))
      .max(60)
      .transform((v) => [...new Set(v)]),
    /** Beschäftigungsausmaß in Wochenstunden laut Vertrag. */
    employmentHours: halfHours(60).nullable(),
    /** Davon Unterricht: Soll-Unterrichtsstunden je Woche (Grundlage der Auslastung im Assistenten). */
    teachingHours: halfHours(40).nullable(),
  })
  .refine(
    (v) =>
      v.employmentHours === null ||
      v.teachingHours === null ||
      v.teachingHours <= v.employmentHours,
    {
      message: 'Der Unterricht kann nicht mehr Stunden haben als das Beschäftigungsausmaß',
      path: ['teachingHours'],
    },
  );
export type TeacherProfileInput = z.infer<typeof teacherProfileInput>;

/** Lehrkräfte-Angaben in der Personen-Ansicht; `plannedHours` = Wochenstunden im veröffentlichten Stundenplan. */
export interface TeacherProfile {
  subjects: { id: string; code: string; name: string }[];
  employmentHours: number | null;
  teachingHours: number | null;
  plannedHours: number;
}

// ───────────────────────── Eltern, Einladungen ─────────────────────────
export const guardianLinkInput = z.object({
  guardianId: z.string().min(1),
  studentId: z.string().min(1),
  canExcuse: z.boolean().default(true),
  validFrom: dateSchema.optional(),
  validTo: dateSchema.nullish().transform((v) => v ?? null),
});
export const guardianCodesInput = z.object({
  studentIds: z.array(z.string().min(1)).min(1).max(500),
  validDays: z.number().int().min(1).max(365).default(30),
});
/** Code im Format XXXX-XXXX-XX (ohne verwechselbare Zeichen); Eingabe darf klein und ohne Striche sein. */
export const guardianCodeSchema = z
  .string()
  .trim()
  .transform((v) => v.toUpperCase().replace(/[^A-Z0-9]/g, ''))
  .pipe(z.string().length(10, 'Der Code hat 10 Zeichen'));
export const guardianCodeRedeemPublic = z.object({
  code: guardianCodeSchema,
  firstName: trimmed(80),
  lastName: trimmed(80),
  email: emailSchema,
  password: passwordSchema,
});
export const guardianCodeRedeemAuthed = z.object({ code: guardianCodeSchema });
export const invitationsInput = z.object({
  personIds: z.array(z.string().min(1)).min(1).max(1000),
});

// ───────────────────────── CSV-Import ─────────────────────────
export const IMPORT_FIELDS = [
  'firstName',
  'lastName',
  'role',
  'class',
  'email',
  'externalId',
  'birthDate',
  'childExternalIds',
] as const;
export type ImportField = (typeof IMPORT_FIELDS)[number];

/** Gängige Spaltennamen (normalisiert: klein, ohne Leer- und Sonderzeichen, ohne Umlautpunkte). */
export const IMPORT_ALIASES: Record<ImportField, string[]> = {
  firstName: ['vorname', 'rufname', 'firstname', 'givenname'],
  lastName: ['nachname', 'familienname', 'zuname', 'lastname', 'surname', 'name'],
  role: ['rolle', 'art', 'typ', 'personenart', 'role', 'funktion'],
  class: ['klasse', 'stammklasse', 'klassenname', 'class', 'klasse1'],
  email: ['email', 'emailadresse', 'mail', 'emailprivat', 'emailschule'],
  externalId: [
    'schuelernummer',
    'schuelernr',
    'schuelerid',
    'matrikelnummer',
    'externalid',
    'id',
    'nummer',
    'kennzeichen',
    'schnr',
  ],
  birthDate: ['geburtsdatum', 'geboren', 'gebdatum', 'birthdate', 'dob'],
  childExternalIds: [
    'kindschuelernummer',
    'kindschuelernr',
    'kinder',
    'kindernummern',
    'kindid',
    'kind',
  ],
};

export const importMapping = z.partialRecord(z.enum(IMPORT_FIELDS), z.string());
export const importInput = z.object({
  csv: z.string().min(1).max(5_000_000),
  /** Optional: Zuordnung kanonisches Feld -> Spaltenname der Datei (überschreibt die automatische Erkennung). */
  mapping: importMapping.optional(),
  delimiter: z.enum([',', ';', '\t']).optional(),
  createClasses: z.boolean().default(false),
  /** Beim Übernehmen: nur fehlerfreie Zeilen importieren. */
  skipErrors: z.boolean().default(false),
  sendInvitations: z.boolean().default(false),
});
export type ImportInput = z.infer<typeof importInput>;

export interface ImportRowResult {
  line: number;
  action: 'create' | 'update' | 'unchanged' | 'error';
  messages: string[];
  record: {
    firstName: string;
    lastName: string;
    kind: PersonKindName | null;
    className: string | null;
    email: string | null;
    externalId: string | null;
  };
}
export interface ImportPreview {
  delimiter: string;
  headers: string[];
  mapping: Partial<Record<ImportField, string>>;
  unmappedRequired: ImportField[];
  summary: {
    total: number;
    create: number;
    update: number;
    unchanged: number;
    errors: number;
    newClasses: string[];
  };
  rows: ImportRowResult[];
}
