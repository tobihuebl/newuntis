/**
 * Einzige Quelle für Rollen und Rechte (docs/spec.md Abschnitt 3).
 * API und Web nutzen dieselbe Matrix. Controller prüfen nie selbst Rollen, sondern fragen `can(...)`.
 *
 * Rollen sind additiv: Eine Person darf, was irgendeine ihrer Rollen darf.
 * Eine Zelle der Matrix nennt den Geltungsbereich (Scope) einer Rolle für eine Aktion.
 */
import type { Role } from './constants';

export const SCOPES = [
  'ALL', // ohne Einschränkung
  'OWN', // nur die eigene Person (resource.studentId bzw. resource.personId)
  'CHILDREN', // nur verknüpfte Kinder (GuardianLink)
  'OWN_CLASSES', // Klassen, die die Person unterrichtet
  'OWN_CLASS', // Klasse, in der die Person Klassenvorstand ist
  'OWN_SUBJECTS', // Kombination Klasse und Fach, die die Person unterrichtet
  'OWN_LESSONS', // Stunden, an denen die Person als Lehrkraft eingetragen ist
  'TO_TEACHERS', // nur Nachrichten an Lehrkräfte
] as const;
export type Scope = (typeof SCOPES)[number];

export const ACTIONS = [
  'timetable.read.own',
  'timetable.read.other',
  'timetable.edit',
  'timetable.publish',
  'classbook.write',
  'attendance.read',
  'absence.report',
  'absence.review',
  'teacherAbsence.report',
  'exam.read',
  'exam.write',
  'grade.write',
  'grade.read',
  'promotion.decide',
  'message.send',
  'announcement.send',
  'substitution.manage',
  'masterdata.read',
  'masterdata.write',
  'reports.read',
  'audit.read',
  'roles.manage',
  'privacy.manage',
] as const;
export type Action = (typeof ACTIONS)[number];

type Matrix = Record<Action, Partial<Record<Role, Scope>>>;

export const PERMISSION_MATRIX: Matrix = {
  'timetable.read.own': {
    STUDENT: 'OWN',
    GUARDIAN: 'CHILDREN',
    TEACHER: 'OWN',
    HOMEROOM: 'OWN',
    PRINCIPAL: 'OWN',
    ADMIN: 'OWN',
  },
  'timetable.read.other': { TEACHER: 'ALL', HOMEROOM: 'ALL', PRINCIPAL: 'ALL', ADMIN: 'ALL' },
  'timetable.edit': { ADMIN: 'ALL' },
  'timetable.publish': { PRINCIPAL: 'ALL', ADMIN: 'ALL' }, // Direktion: freigeben
  'classbook.write': { TEACHER: 'OWN_LESSONS', HOMEROOM: 'OWN_LESSONS', PRINCIPAL: 'ALL' }, // Direktion: Korrektur
  'attendance.read': {
    STUDENT: 'OWN',
    GUARDIAN: 'CHILDREN',
    TEACHER: 'OWN_CLASSES',
    HOMEROOM: 'OWN_CLASS',
    PRINCIPAL: 'ALL',
    ADMIN: 'ALL',
  },
  'absence.report': { STUDENT: 'OWN', GUARDIAN: 'CHILDREN', ADMIN: 'ALL' }, // Schüler: optional (Altersgrenze pro Schule)
  'absence.review': { HOMEROOM: 'OWN_CLASS', PRINCIPAL: 'ALL', ADMIN: 'ALL' },
  // Krankmeldung: Lehrkräfte für sich selbst, Direktion und Administration für alle (Spec Abschnitt 9)
  'teacherAbsence.report': { TEACHER: 'OWN', HOMEROOM: 'OWN', PRINCIPAL: 'ALL', ADMIN: 'ALL' },
  'exam.read': {
    STUDENT: 'OWN',
    GUARDIAN: 'CHILDREN',
    TEACHER: 'OWN_CLASSES',
    HOMEROOM: 'OWN_CLASS',
    PRINCIPAL: 'ALL',
    ADMIN: 'ALL',
  },
  'exam.write': { TEACHER: 'OWN_SUBJECTS', HOMEROOM: 'OWN_SUBJECTS', PRINCIPAL: 'ALL' },
  'grade.write': { TEACHER: 'OWN_SUBJECTS', HOMEROOM: 'OWN_SUBJECTS' },
  'grade.read': {
    STUDENT: 'OWN',
    GUARDIAN: 'CHILDREN',
    TEACHER: 'OWN_SUBJECTS',
    HOMEROOM: 'OWN_CLASS',
    PRINCIPAL: 'ALL',
    ADMIN: 'ALL', // lesen (Entscheidung 14.10., abweichend von der ersten Matrix)
  },
  // Schuljahreswechsel (SD-05): Entscheidung am Schuljahresende je Schüler:in
  'promotion.decide': { HOMEROOM: 'OWN_CLASS', PRINCIPAL: 'ALL', ADMIN: 'ALL' },
  'message.send': {
    GUARDIAN: 'TO_TEACHERS',
    TEACHER: 'ALL',
    HOMEROOM: 'ALL',
    PRINCIPAL: 'ALL',
    ADMIN: 'ALL',
  },
  'announcement.send': { PRINCIPAL: 'ALL', ADMIN: 'ALL' },
  'substitution.manage': { PRINCIPAL: 'ALL', ADMIN: 'ALL' },
  'masterdata.read': { PRINCIPAL: 'ALL', ADMIN: 'ALL' },
  'masterdata.write': { ADMIN: 'ALL' },
  'reports.read': { HOMEROOM: 'OWN_CLASS', PRINCIPAL: 'ALL', ADMIN: 'ALL' },
  'audit.read': { PRINCIPAL: 'ALL', ADMIN: 'ALL' },
  'roles.manage': { ADMIN: 'ALL' },
  'privacy.manage': { ADMIN: 'ALL' },
};

/** Beziehungen der angemeldeten Person; die API lädt sie pro Anfrage aus der Datenbank. */
export interface PolicyUser {
  personId: string;
  roles: readonly Role[];
  /** Verknüpfte Kinder mit gültigem GuardianLink. */
  guardianOfStudentIds?: readonly string[];
  /** Klassen, in denen die Person unterrichtet. */
  teachesClassIds?: readonly string[];
  /** Klassen, in denen die Person Klassenvorstand ist. */
  homeroomClassIds?: readonly string[];
  /** Paare "klassenId:fachId", die die Person unterrichtet. */
  teachingPairs?: readonly string[];
}

/** Gegenstand der Prüfung; nur die Felder, die der Scope der Aktion braucht. */
export interface PolicyResource {
  personId?: string;
  studentId?: string;
  classId?: string;
  subjectId?: string;
  /** Lehrkräfte der Stunde (wirksame Lehrer des Termins). */
  teacherIds?: readonly string[];
  /** Bei Nachrichten: sind alle Empfänger Lehrkräfte? */
  recipientsAreTeachers?: boolean;
}

function scopeMatches(scope: Scope, user: PolicyUser, r: PolicyResource): boolean {
  switch (scope) {
    case 'ALL':
      return true;
    case 'OWN':
      return (r.studentId ?? r.personId) === user.personId;
    case 'CHILDREN':
      return r.studentId !== undefined && (user.guardianOfStudentIds ?? []).includes(r.studentId);
    case 'OWN_CLASSES':
      return r.classId !== undefined && (user.teachesClassIds ?? []).includes(r.classId);
    case 'OWN_CLASS':
      return r.classId !== undefined && (user.homeroomClassIds ?? []).includes(r.classId);
    case 'OWN_SUBJECTS':
      return (
        r.classId !== undefined &&
        r.subjectId !== undefined &&
        (user.teachingPairs ?? []).includes(`${r.classId}:${r.subjectId}`)
      );
    case 'OWN_LESSONS':
      return (r.teacherIds ?? []).includes(user.personId);
    case 'TO_TEACHERS':
      return r.recipientsAreTeachers === true;
  }
}

/**
 * Darf der Nutzer die Aktion ausführen?
 * Ohne `resource` wird nur geprüft, ob irgendeine Rolle die Aktion grundsätzlich kennt (Navigation, Sichtbarkeit).
 * Mit `resource` wird der Scope der Rolle streng gegen den Gegenstand geprüft.
 */
export function can(user: PolicyUser, action: Action, resource?: PolicyResource): boolean {
  const cells = PERMISSION_MATRIX[action];
  return user.roles.some((role) => {
    const scope = cells[role];
    if (scope === undefined) return false;
    return resource === undefined ? true : scopeMatches(scope, user, resource);
  });
}

/** Hat eine der Rollen für die Aktion genau diesen Geltungsbereich (z. B. schulweit "ALL")? */
export function hasScope(user: PolicyUser, action: Action, scope: Scope): boolean {
  return user.roles.some((role) => PERMISSION_MATRIX[action][role] === scope);
}

export function rolesAllowing(action: Action): Role[] {
  return Object.keys(PERMISSION_MATRIX[action]) as Role[];
}
