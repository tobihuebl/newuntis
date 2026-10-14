/**
 * Onboarding (Konzept vom 14.10.2026, ADR 0020): eine Engine, Flows je Rolle als Konfiguration, Fortschritt
 * serverseitig je Schritt. Web und Handy rendern dieselben Schritte (PWA, responsiv).
 *
 * Gerüst je Flow: Willkommen (Datenschutz, Benachrichtigungen) → Pflicht-Setup der Rolle → Aha-Moment
 * (geführte erste Aktion) → Checkliste mit Coachmarks → jederzeit wiederholbar über "Hilfe und Tour".
 */
import { z } from 'zod';
import type { Role } from './constants';

export const ONBOARDING_FLOWS = ['admin', 'principal', 'teacher', 'guardian', 'student'] as const;
export type OnboardingFlowId = (typeof ONBOARDING_FLOWS)[number];

export const STEP_STATUSES = ['OPEN', 'DONE', 'SKIPPED'] as const;
export type StepStatus = (typeof STEP_STATUSES)[number];

export const STEP_PHASES = ['welcome', 'setup', 'aha', 'checklist'] as const;
export type StepPhase = (typeof STEP_PHASES)[number];

export interface OnboardingStepDef {
  /** Global eindeutig; derselbe Schritt in mehreren Flows (z. B. privacy) zählt einmal. Ohne Punkt (i18n-Schlüssel). */
  id: string;
  phase: StepPhase;
  /** Pflicht: solange offen, leitet die App nach /willkommen. Optionale Schritte blockieren nie. */
  required?: boolean;
  /** Erledigt sich durch Daten (z. B. erster Klassenbucheintrag), nicht durch einen Klick. */
  auto?: boolean;
  /** Ziel für Einrichtung, Aha-Moment und Checkliste; "{class}" = eigene Klasse (Klassenvorstand). */
  href?: string;
  /** Element mit data-tour="…" auf der Zielseite, auf das die Coachmark zeigt. */
  anchor?: string;
  /** Nur für Klassenvorstände. */
  homeroom?: boolean;
  /** Einrichtung am Computer: auf dem Handy mit Hinweis "am Computer fortsetzen". */
  desktop?: boolean;
}

export interface OnboardingFlowDef {
  id: OnboardingFlowId;
  /** Steigt, wenn Schritte dazukommen; bestehende Nutzer:innen sehen nur die neuen (Fortschritt je Schritt). */
  version: number;
  steps: OnboardingStepDef[];
}

const WELCOME: OnboardingStepDef[] = [
  { id: 'privacy', phase: 'welcome', required: true },
  { id: 'push', phase: 'welcome' },
];

export const ONBOARDING: Record<OnboardingFlowId, OnboardingFlowDef> = {
  admin: {
    id: 'admin',
    version: 1,
    steps: [
      ...WELCOME,
      {
        id: 'adminSchoolYear',
        phase: 'setup',
        auto: true,
        desktop: true,
        href: '/admin/schuljahr',
      },
      { id: 'adminPeriods', phase: 'setup', auto: true, desktop: true, href: '/admin/raster' },
      { id: 'adminMasterdata', phase: 'setup', auto: true, desktop: true, href: '/admin/klassen' },
      { id: 'adminPersons', phase: 'setup', auto: true, desktop: true, href: '/admin/import' },
      { id: 'adminAccess', phase: 'setup', auto: true, desktop: true, href: '/admin/rollen' },
      { id: 'adminTimetable', phase: 'aha', auto: true, desktop: true, href: '/admin/stundenplan' },
      {
        id: 'adminInviteTeachers',
        phase: 'checklist',
        auto: true,
        href: '/admin/personen?kind=TEACHER',
        anchor: 'page',
      },
      { id: 'adminSubstitutions', phase: 'checklist', href: '/supplierung', anchor: 'page' },
      { id: 'adminDashboard', phase: 'checklist', href: '/lagebild', anchor: 'page' },
    ],
  },
  principal: {
    id: 'principal',
    version: 1,
    steps: [
      ...WELCOME,
      { id: 'notify', phase: 'setup' },
      { id: 'principalDashboard', phase: 'aha', href: '/lagebild', anchor: 'page' },
      { id: 'principalApprovals', phase: 'checklist', href: '/freigaben', anchor: 'page' },
      { id: 'principalSubstitutions', phase: 'checklist', href: '/supplierung', anchor: 'page' },
      {
        id: 'principalAnnouncement',
        phase: 'checklist',
        auto: true,
        href: '/rundschreiben/neu',
        anchor: 'page',
      },
    ],
  },
  teacher: {
    id: 'teacher',
    version: 1,
    steps: [
      ...WELCOME,
      { id: 'teacherData', phase: 'setup', required: true },
      { id: 'teacherTimetable', phase: 'setup', required: true },
      { id: 'teacherFirstEntry', phase: 'aha', auto: true, href: '/heute', anchor: 'next' },
      {
        id: 'homeroomLetters',
        phase: 'checklist',
        auto: true,
        homeroom: true,
        href: '/klasse/{class}/zugang',
        anchor: 'page',
      },
      {
        id: 'homeroomApprovals',
        phase: 'checklist',
        homeroom: true,
        href: '/klasse/{class}/entschuldigungen',
        anchor: 'page',
      },
      { id: 'teacherSubstitution', phase: 'checklist', href: '/plan', anchor: 'page' },
      {
        id: 'teacherParentMessage',
        phase: 'checklist',
        auto: true,
        href: '/nachrichten/neu',
        anchor: 'page',
      },
    ],
  },
  guardian: {
    id: 'guardian',
    version: 1,
    steps: [
      ...WELCOME,
      { id: 'guardianChildren', phase: 'setup', required: true },
      { id: 'notify', phase: 'setup' },
      { id: 'guardianToday', phase: 'aha', href: '/heute', anchor: 'page' },
      {
        id: 'guardianExcuse',
        phase: 'checklist',
        auto: true,
        href: '/abwesenheit/neu',
        anchor: 'page',
      },
      {
        id: 'guardianMoreChildren',
        phase: 'checklist',
        auto: true,
        href: '/profil',
        anchor: 'children',
      },
    ],
  },
  student: {
    id: 'student',
    version: 1,
    steps: [
      ...WELCOME,
      { id: 'studentProfile', phase: 'setup', required: true },
      { id: 'studentClass', phase: 'setup', required: true },
      { id: 'studentToday', phase: 'aha', href: '/heute', anchor: 'next' },
      { id: 'studentPush', phase: 'checklist', auto: true, href: '/profil', anchor: 'push' },
      { id: 'studentHomework', phase: 'checklist', href: '/aufgaben', anchor: 'page' },
      { id: 'studentInstall', phase: 'checklist', href: '/heute', anchor: 'install' },
    ],
  },
};

/** Pseudo-Schritt: Checkliste ausgeblendet (SKIPPED) oder wieder eingeblendet (OPEN). */
export const CHECKLIST_HIDDEN = 'checklistHidden';

/** Flows einer Person aus ihren Rollen (Rolle kommt aus der Einladung, nie aus freier Wahl). */
export function flowsFor(roles: readonly Role[]): OnboardingFlowId[] {
  const has = (r: Role) => roles.includes(r);
  const out: OnboardingFlowId[] = [];
  if (has('ADMIN')) out.push('admin');
  if (has('PRINCIPAL')) out.push('principal');
  if (has('TEACHER') || has('HOMEROOM')) out.push('teacher');
  if (has('GUARDIAN')) out.push('guardian');
  if (has('STUDENT')) out.push('student');
  return out;
}

export interface ComposedStep extends OnboardingStepDef {
  flow: OnboardingFlowId;
}

/**
 * Schritte einer Person über alle ihre Flows: Willkommen einmal, dann Einrichtung, Aha und Checkliste je Flow
 * in der Reihenfolge der Flows. Ein Schritt, der in mehreren Flows vorkommt, zählt beim ersten.
 */
export function composeSteps(
  flows: readonly OnboardingFlowId[],
  opts: { homeroom: boolean },
): ComposedStep[] {
  const seen = new Set<string>();
  const out: ComposedStep[] = [];
  for (const phase of STEP_PHASES) {
    for (const flow of flows) {
      for (const s of ONBOARDING[flow].steps) {
        if (s.phase !== phase || seen.has(s.id)) continue;
        if (s.homeroom && !opts.homeroom) continue;
        seen.add(s.id);
        out.push({ ...s, flow });
      }
    }
  }
  return out;
}

/** Schritte, die im Ablauf /willkommen gezeigt werden (Willkommen und Einrichtung, nicht datengetrieben). */
export function isFlowStep(s: OnboardingStepDef): boolean {
  return (s.phase === 'welcome' || s.phase === 'setup') && !s.auto;
}

export function findStep(id: string): OnboardingStepDef | undefined {
  for (const f of ONBOARDING_FLOWS) {
    const s = ONBOARDING[f].steps.find((x) => x.id === id);
    if (s) return s;
  }
  return undefined;
}

// ───────────────────────── API ─────────────────────────

export const stepUpdateInput = z.object({
  stepId: z.string().min(1).max(40),
  /** VIEWED setzt nur den Zeitpunkt der ersten Anzeige (step_viewed). */
  status: z.enum(['VIEWED', 'DONE', 'SKIPPED', 'OPEN']),
});
export type StepUpdateInput = z.infer<typeof stepUpdateInput>;

export interface OnboardingStepState {
  id: string;
  flow: OnboardingFlowId;
  phase: StepPhase;
  required: boolean;
  auto: boolean;
  desktop: boolean;
  status: StepStatus;
  /** Aufgelöst ({class} ersetzt); null, wenn das Ziel fehlt (z. B. keine eigene Klasse). */
  href: string | null;
  anchor: string | null;
}

/** Kontext für die Schritte der Einrichtung (nur, was die Person ohnehin sehen darf). */
export interface OnboardingContext {
  teacher?: {
    subjects: string[];
    employmentHours: number | null;
    teachingHours: number | null;
    classes: string[];
    homeroomClass: { id: string; name: string } | null;
  };
  student?: {
    className: string | null;
    homeroomTeacher: string | null;
    avatar: string | null;
  };
  guardian?: {
    children: { id: string; firstName: string; lastName: string; className: string | null }[];
  };
}

export interface OnboardingState {
  flows: OnboardingFlowId[];
  /** Flow der Startansicht (bestimmt den Aha-Moment am Ende von /willkommen). */
  primary: OnboardingFlowId | null;
  steps: OnboardingStepState[];
  /** Mindestens ein Pflichtschritt offen: die App leitet nach /willkommen. */
  needsFlow: boolean;
  checklistHidden: boolean;
  context: OnboardingContext;
}

/** Erledigt zählt auch übersprungen (Checkliste und Fortschrittsbalken). */
export const isSettled = (s: { status: StepStatus }) => s.status !== 'OPEN';

// ───────────────────────── Auswertung (step_viewed, step_completed, step_skipped, time_to_aha) ─────────────────────────

export interface OnboardingStepStats {
  stepId: string;
  phase: StepPhase;
  viewed: number;
  done: number;
  skipped: number;
}

export interface OnboardingFlowStats {
  flow: OnboardingFlowId;
  /** Personen, die den Flow begonnen haben (mindestens ein Schritt angezeigt). */
  started: number;
  /** Personen mit erledigtem Aha-Moment. */
  reachedAha: number;
  /** Median der Zeit vom ersten angezeigten Schritt bis zum Aha-Moment, in Stunden. */
  medianHoursToAha: number | null;
  steps: OnboardingStepStats[];
}

/** Median einer Liste (leere Liste: null). */
export function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

// ───────────────────────── Avatar (Schüler:innen, ohne Foto) ─────────────────────────

/** Symbol und Farbe statt Foto: keine Bilder von Kindern im System. */
export const AVATAR_SYMBOLS = [
  'cat',
  'dog',
  'rabbit',
  'bird',
  'fish',
  'turtle',
  'rocket',
  'star',
  'sun',
  'moon',
  'flower',
  'leaf',
] as const;
/** Fächerfarben des Design Systems (Text darauf: on-fach). */
export const AVATAR_COLORS = [
  'kobalt',
  'mint',
  'himmel',
  'flieder',
  'rosa',
  'limette',
  'koralle',
  'sand',
] as const;
export type AvatarSymbol = (typeof AVATAR_SYMBOLS)[number];
export type AvatarColor = (typeof AVATAR_COLORS)[number];

export const avatarInput = z.object({
  symbol: z.enum(AVATAR_SYMBOLS),
  color: z.enum(AVATAR_COLORS),
});
export const avatarOf = (
  v: string | null | undefined,
): { symbol: AvatarSymbol; color: AvatarColor } | null => {
  if (!v) return null;
  const r = avatarInput.safeParse({ symbol: v.split(':')[0], color: v.split(':')[1] });
  return r.success ? r.data : null;
};

// ───────────────────────── Zugangscode (Beitritt Schüler:innen) ─────────────────────────

/** Code im Format XXXX-XXXX-XX wie der Eltern-Code; Eingabe darf klein und ohne Striche sein. */
export const accessCodeSchema = z
  .string()
  .trim()
  .transform((v) => v.toUpperCase().replace(/[^A-Z0-9]/g, ''))
  .pipe(z.string().length(10));

export const ACCESS_CODE_VALID_DAYS = 30;

export const accessCodesInput = z.object({
  studentIds: z.array(z.string().min(1).max(64)).min(1).max(60),
  /** Elternbrief mit Eltern-Code gleich mit ausstellen. */
  withGuardianCodes: z.boolean().default(false),
});
export const accessCodeCheck = z.object({ code: accessCodeSchema });
export const accessCodeRedeem = z.object({
  code: accessCodeSchema,
  password: z.string().min(12).max(128),
});

/** Zugangsbrief: Klartext-Codes gibt es nur in dieser Antwort. */
export interface AccessLetter {
  personId: string;
  firstName: string;
  lastName: string;
  className: string | null;
  username: string;
  code: string;
  guardianCode: string | null;
  expiresAt: string;
}

export const ACCESS_STATUSES = ['active', 'issued', 'none'] as const;
export type AccessStatus = (typeof ACCESS_STATUSES)[number];

export interface ClassAccessRow {
  studentId: string;
  name: string;
  status: AccessStatus;
  username: string | null;
  /** Offener Code läuft ab (nur bei issued). */
  expiresAt: string | null;
  guardians: number;
}

export interface ClassAccessView {
  classId: string;
  className: string;
  rows: ClassAccessRow[];
}

/** Ergebnis der Prüfung vor dem Einlösen: nur Vorname und Klasse, damit das Kind sich wiedererkennt. */
export interface AccessCodeInfo {
  firstName: string;
  className: string | null;
  username: string;
  /** Konto besteht schon: Einlösen setzt ein neues Passwort. */
  reset: boolean;
}

/** Benutzername aus dem Namen: Kleinbuchstaben, Umlaute ausgeschrieben, Punkt zwischen Vor- und Nachname. */
export function usernameBase(firstName: string, lastName: string): string {
  const norm = (s: string) =>
    s
      .toLowerCase()
      .replace(/ä/g, 'ae')
      .replace(/ö/g, 'oe')
      .replace(/ü/g, 'ue')
      .replace(/ß/g, 'ss')
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  const first = norm(firstName).split('-')[0] || 'schueler';
  const last = norm(lastName) || 'in';
  return `${first}.${last}`.slice(0, 50);
}
