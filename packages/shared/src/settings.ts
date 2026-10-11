import { z } from 'zod';

/** Schema für `Tenant.settings` (Fristen, Grenzwerte, Altersgrenzen). Alle Werte pro Schule konfigurierbar. */
export const tenantSettingsSchema = z.object({
  /** Datum eines Montags einer A-Woche (YYYY-MM-DD), Grundlage für Wochenmuster A/B. */
  abWeekReferenceMonday: z.iso.date().optional(),
  absence: z
    .object({
      excuseDeadlineDays: z.number().int().min(0).default(7),
      attachmentRequiredFromDays: z.number().int().min(1).default(3),
    })
    .default({ excuseDeadlineDays: 7, attachmentRequiredFromDays: 3 }),
  exams: z
    .object({
      maxPerDayPerClass: z.number().int().min(1).default(1),
      maxPerWeekPerClass: z.number().int().min(1).default(3),
    })
    .default({ maxPerDayPerClass: 1, maxPerWeekPerClass: 3 }),
  ageLimits: z
    .object({
      studentLoginFrom: z.number().int().min(0).default(10),
      selfExcuseFrom: z.number().int().min(0).default(14),
      seeGradesFrom: z.number().int().min(0).default(14),
    })
    .default({ studentLoginFrom: 10, selfExcuseFrom: 14, seeGradesFrom: 14 }),
  retention: z
    .object({
      messagesDays: z.number().int().min(1).default(365),
      absencesDays: z.number().int().min(1).default(1825),
      attachmentsDays: z.number().int().min(1).default(365),
      auditLogDays: z.number().int().min(1).default(1095),
    })
    .default({ messagesDays: 365, absencesDays: 1825, attachmentsDays: 365, auditLogDays: 1095 }),
});
export type TenantSettings = z.infer<typeof tenantSettingsSchema>;
