import { z } from 'zod';
import { WEEK_PATTERNS } from './constants';
import { dateSchema } from './masterdata';

const id = z.string().min(1);
const optionalId = id.nullish().transform((v) => v ?? null);

export const versionCreateInput = z.object({
  schoolYearId: id,
  name: z
    .string()
    .trim()
    .max(80)
    .nullish()
    .transform((v) => v || null),
  /** Regeln und Soll-Stunden aus dieser Version übernehmen (z. B. der veröffentlichten). */
  copyFromVersionId: optionalId,
});
export const versionPatchInput = z.object({ name: z.string().trim().max(80).nullable() });

export const lessonInput = z
  .object({
    subjectId: id,
    classId: optionalId,
    groupId: optionalId,
    roomId: optionalId,
    weekday: z.number().int().min(1).max(5),
    periodStart: z.number().int().min(1).max(20),
    periodCount: z.number().int().min(1).max(4).default(1),
    weekPattern: z.enum(WEEK_PATTERNS).default('EVERY'),
    teacherIds: z.array(id).max(4).default([]),
  })
  .refine((v) => !v.classId !== !v.groupId, {
    message: 'Genau eine Klasse oder Gruppe angeben',
    path: ['classId'],
  });
export type LessonInput = z.infer<typeof lessonInput>;

/** Änderung einer Regel mit optimistischer Sperre: `version` ist der Stand, den der Client kennt. */
export const lessonPatchInput = z.object({
  version: z.number().int().min(1),
  subjectId: id.optional(),
  classId: id.nullable().optional(),
  groupId: id.nullable().optional(),
  roomId: id.nullable().optional(),
  weekday: z.number().int().min(1).max(5).optional(),
  periodStart: z.number().int().min(1).max(20).optional(),
  periodCount: z.number().int().min(1).max(4).optional(),
  weekPattern: z.enum(WEEK_PATTERNS).optional(),
  teacherIds: z.array(id).max(4).optional(),
});
export type LessonPatchInput = z.infer<typeof lessonPatchInput>;

export const requirementInput = z
  .object({
    subjectId: id,
    classId: optionalId,
    groupId: optionalId,
    teacherId: id,
    hoursPerWeek: z.number().int().min(1).max(20),
    preferDouble: z.boolean().default(false),
  })
  .refine((v) => !v.classId !== !v.groupId, {
    message: 'Genau eine Klasse oder Gruppe angeben',
    path: ['classId'],
  });
export const requirementPatchInput = z
  .object({
    teacherId: id,
    hoursPerWeek: z.number().int().min(1).max(20),
    preferDouble: z.boolean(),
  })
  .partial();

export const publishInput = z.object({
  validFrom: dateSchema,
  /** Soll und Ist weichen ab (zu wenige/zu viele Stunden): bewusst trotzdem veröffentlichen (M7). */
  acceptCoverage: z.boolean().default(false),
});

export const timetableRangeQuery = z
  .object({ from: dateSchema.optional(), to: dateSchema.optional(), studentId: id.optional() })
  .refine((v) => !v.from || !v.to || v.from <= v.to, {
    message: 'from muss vor to liegen',
    path: ['to'],
  });

/** Ein Eintrag im Stundenplan einer Person, Klasse, Lehrkraft oder eines Raums. */
export interface PlanEntry {
  /** Termin-ID; geplante Termine jenseits des erzeugten Fensters haben "plan:<regel>:<datum>". */
  id: string;
  planned: boolean;
  date: string;
  periodStart: number;
  periodCount: number;
  startsAt: string;
  endsAt: string;
  status: 'SCHEDULED' | 'CANCELLED' | 'SUBSTITUTED' | 'ROOM_CHANGED';
  subject: { id: string; name: string; code: string; color: string | null };
  class: { id: string; name: string } | null;
  group: { id: string; name: string } | null;
  room: { id: string; name: string } | null;
  teachers: { id: string; name: string }[];
}
export interface PlanResponse {
  from: string;
  to: string;
  periods: { number: number; startTime: string; endTime: string }[];
  entries: PlanEntry[];
}
