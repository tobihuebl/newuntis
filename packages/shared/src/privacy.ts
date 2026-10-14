/**
 * Datenschutz (Spec Abschnitt 13): Betroffenenrechte, Export, Einwilligungen und Einführung nach dem ersten Login.
 */
import { z } from 'zod';

/** Version des Datenschutzhinweises; eine neue Version fragt beim nächsten Öffnen erneut nach. */
export const PRIVACY_NOTICE_VERSION = '2026-10';
export const CONSENT_KINDS = ['privacy-notice'] as const;

export const onboardingInput = z.object({
  privacyNoticeVersion: z.literal(PRIVACY_NOTICE_VERSION),
});

export const PRIVACY_REQUEST_KINDS = ['ACCESS', 'RECTIFICATION', 'ERASURE', 'RESTRICTION'] as const;
export type PrivacyRequestKind = (typeof PRIVACY_REQUEST_KINDS)[number];
export const PRIVACY_REQUEST_STATUSES = ['OPEN', 'DONE', 'REJECTED'] as const;
export type PrivacyRequestStatus = (typeof PRIVACY_REQUEST_STATUSES)[number];

export const privacyRequestInput = z.object({
  personId: z.string().min(1).max(64),
  kind: z.enum(PRIVACY_REQUEST_KINDS),
  note: z.string().trim().max(2000).nullable().optional(),
});

/**
 * Abschluss einer Anfrage. Bei ERASURE anonymisiert DONE die Person, bei RESTRICTION setzt DONE die
 * Einschränkung (lift = true hebt sie wieder auf). ACCESS und RECTIFICATION werden nur dokumentiert.
 */
export const privacyRequestPatch = z.object({
  status: z.enum(['DONE', 'REJECTED']),
  note: z.string().trim().max(2000).nullable().optional(),
  lift: z.boolean().optional(),
});

export const privacyListQuery = z.object({
  status: z.enum(PRIVACY_REQUEST_STATUSES).optional(),
});

export const exportQuery = z.object({ format: z.enum(['json', 'pdf']).default('json') });

export interface PrivacyRequestItem {
  id: string;
  person: { id: string; name: string; kind: string; anonymized: boolean; restricted: boolean };
  kind: PrivacyRequestKind;
  status: PrivacyRequestStatus;
  note: string | null;
  createdAt: string;
  createdBy: string | null;
  resolvedAt: string | null;
  resolvedBy: string | null;
}

/** Abschnitte des Datenexports (JSON und PDF haben dieselbe Gliederung). */
export interface PersonExport {
  generatedAt: string;
  school: string;
  person: {
    id: string;
    kind: string;
    firstName: string;
    lastName: string;
    birthDate: string | null;
    externalId: string | null;
    email: string | null;
    anonymized: boolean;
    restricted: boolean;
  };
  account: {
    email: string;
    twoFactor: boolean;
    lastLoginAt: string | null;
    createdAt: string;
  } | null;
  roles: { role: string; className: string | null }[];
  enrollments: { className: string; fromDate: string; toDate: string | null }[];
  guardianOf: { name: string; validFrom: string; validTo: string | null }[];
  guardians: { name: string; validFrom: string; validTo: string | null }[];
  attendance: { date: string; subject: string; status: string; lateMinutes: number | null }[];
  /** Freigegebene Noten (PN-02). */
  grades: {
    date: string;
    subject: string;
    kind: string;
    title: string;
    value: number;
    comment: string | null;
  }[];
  /** Vermerke im Klassenbuch über die Person (KB-07). */
  remarks: { date: string; subject: string; text: string; createdAt: string }[];
  absences: {
    fromAt: string;
    toAt: string;
    status: string;
    reasonCode: string | null;
    reason: string | null;
    reviewComment: string | null;
    hasAttachment: boolean;
  }[];
  teacherAbsences: { fromAt: string; toAt: string; kind: string; note: string | null }[];
  messages: { thread: string; at: string; body: string }[];
  announcementsRead: { title: string; readAt: string | null }[];
  notifications: { type: string; createdAt: string; readAt: string | null }[];
  preferences: { type: string; channel: string; enabled: boolean }[];
  devices: { userAgent: string | null; lastSeenAt: string }[];
  consents: { kind: string; version: string; acceptedAt: string }[];
  auditTrail: { at: string; action: string; entity: string }[];
}
