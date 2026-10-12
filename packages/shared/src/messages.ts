/**
 * Kommunikation (KO-01, KO-02, Spec Abschnitt 4 und 9): Nachrichten in Gesprächen und Rundschreiben mit
 * Lesebestätigung. Wer wem schreiben darf, regelt die Aktion `message.send` der Rechte-Matrix; die API
 * bestimmt die erlaubten Empfänger:innen (siehe ADR 0009).
 */
import { z } from 'zod';

const id = z.string().min(1).max(64);
const text = (max: number) => z.string().trim().min(1).max(max);

/** Nachricht an eine Klasse: je Familie (bzw. je Schüler:in) ein eigenes Gespräch, Antworten bleiben privat. */
export const CLASS_AUDIENCES = ['guardians', 'students'] as const;
export type ClassAudience = (typeof CLASS_AUDIENCES)[number];

export const threadCreateInput = z.object({
  subject: text(200),
  body: text(5000),
  to: z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('persons'), personIds: z.array(id).min(1).max(50) }),
    z.object({ kind: z.literal('class'), classId: id, audience: z.enum(CLASS_AUDIENCES) }),
  ]),
});
export type ThreadCreateInput = z.infer<typeof threadCreateInput>;

export const messageInput = z.object({ body: text(5000) });

export const threadListQuery = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(30),
  cursor: id.optional(),
});

export const recipientQuery = z.object({ q: z.string().trim().max(100).optional() });

export interface PersonRef {
  id: string;
  name: string;
}

export type RecipientKind = 'staff' | 'student' | 'guardian';

export interface Recipient extends PersonRef {
  kind: RecipientKind;
  /** Zusatz zur Unterscheidung, z. B. Klasse oder "Eltern von Lena (3A)". */
  context: string | null;
}

export interface MessageClassOption {
  id: string;
  name: string;
}

export interface ThreadSummary {
  id: string;
  subject: string;
  /** Andere Teilnehmer:innen (höchstens 4), dazu die Gesamtzahl. */
  participants: PersonRef[];
  participantCount: number;
  aboutStudent: PersonRef | null;
  className: string | null;
  lastMessage: { senderName: string; preview: string; at: string; own: boolean } | null;
  unread: number;
}

export interface MessageItem {
  id: string;
  senderId: string;
  senderName: string;
  body: string;
  at: string;
  own: boolean;
}

export interface ThreadDetail {
  id: string;
  subject: string;
  participants: (PersonRef & { kind: RecipientKind })[];
  aboutStudent: PersonRef | null;
  className: string | null;
  messages: MessageItem[];
  canReply: boolean;
}

// ───────────── Rundschreiben ─────────────

/** Zielgruppen eines Rundschreibens; ohne Klassen und Gruppen gilt es für die ganze Schule. */
export const AUDIENCE_ROLES = ['STUDENT', 'GUARDIAN', 'TEACHER'] as const;
export type AudienceRole = (typeof AUDIENCE_ROLES)[number];

export const audienceSchema = z.object({
  roles: z.array(z.enum(AUDIENCE_ROLES)).min(1).max(3),
  classIds: z.array(id).max(100).default([]),
  groupIds: z.array(id).max(100).default([]),
});
export type Audience = z.infer<typeof audienceSchema>;

export const announcementInput = z.object({
  title: text(200),
  body: text(10000),
  audience: audienceSchema,
  requiresRead: z.boolean().default(false),
});
export type AnnouncementInput = z.infer<typeof announcementInput>;

export const announcementListQuery = z.object({
  /** "sent": alle Rundschreiben der Schule (nur mit announcement.send). */
  view: z.enum(['inbox', 'sent']).default('inbox'),
  limit: z.coerce.number().int().min(1).max(50).default(30),
  cursor: id.optional(),
});

export interface AnnouncementItem {
  id: string;
  title: string;
  body: string;
  author: string;
  publishedAt: string;
  requiresRead: boolean;
  /** Eigener Lesestatus (null = ungelesen; bei "sent" ohne Bedeutung). */
  readAt: string | null;
  audience: Audience;
  /** Nur für Absender:innen (announcement.send). */
  stats: { recipients: number; read: number } | null;
}

export interface AnnouncementDetail extends AnnouncementItem {
  /** Nur für Absender:innen: wer noch nicht gelesen hat. */
  unread: Recipient[] | null;
  isRecipient: boolean;
}

/** Ungelesenes für Heute und die Navigation. */
export interface InboxCounts {
  messages: number;
  announcements: number;
  /** Davon Rundschreiben mit ausstehender Lesebestätigung. */
  required: number;
}

/** Vorschau einer Nachricht in der Liste: eine Zeile, höchstens `max` Zeichen. */
export function messagePreview(body: string, max = 120): string {
  const line = body.replace(/\s+/g, ' ').trim();
  return line.length > max ? `${line.slice(0, max - 1).trimEnd()}…` : line;
}

// ───────────── Klassen der Lehrkraft (/klassen) ─────────────

export interface MyClass {
  id: string;
  name: string;
  homeroom: boolean;
  students: number;
  /** Fächer, die die Person in dieser Klasse unterrichtet. */
  subjects: string[];
}

export interface MyClassDetail {
  id: string;
  name: string;
  homeroomTeacher: string | null;
  isHomeroom: boolean;
  students: { id: string; name: string; hasAccount: boolean; guardians: number }[];
  subjects: { name: string; teachers: string[] }[];
}
