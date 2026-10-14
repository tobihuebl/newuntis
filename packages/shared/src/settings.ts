import { z } from 'zod';

/** Schema für `Tenant.settings` (Fristen, Grenzwerte, Altersgrenzen). Alle Werte pro Schule konfigurierbar. */
export const tenantSettingsSchema = z.object({
  /** Datum eines Montags einer A-Woche (YYYY-MM-DD), Grundlage für Wochenmuster A/B. */
  abWeekReferenceMonday: z.iso.date().optional(),
  security: z
    .object({
      sessionIdleMinutes: z.number().int().min(5).default(480),
      maxFailedLogins: z.number().int().min(3).default(5),
      lockoutMinutes: z.number().int().min(1).default(15),
    })
    .default({ sessionIdleMinutes: 480, maxFailedLogins: 5, lockoutMinutes: 15 }),
  absence: z
    .object({
      excuseDeadlineDays: z.number().int().min(0).default(7),
      attachmentRequiredFromDays: z.number().int().min(1).default(3),
      /** Erinnerungen an Eltern so viele Tage nach Beginn einer offenen Fehlzeit. */
      reminderAfterDays: z.array(z.number().int().min(0)).default([1, 4]),
      /**
       * Frühwarnung (AB-05): unentschuldigte Fehlstunden im Schuljahr, ab denen der Klassenvorstand gewarnt wird
       * (0 = aus). Standard bewusst unter der Grenze des Schulpflichtgesetzes (15 Stunden im Semester).
       */
      warnUnexcusedLessons: z.number().int().min(0).max(200).default(10),
      /** Frühwarnung: Fehlstunden insgesamt (auch entschuldigt) in den letzten `warnWindowDays` Tagen (0 = aus). */
      warnLessons: z.number().int().min(0).max(500).default(30),
      warnWindowDays: z.number().int().min(7).max(120).default(30),
    })
    .default({
      excuseDeadlineDays: 7,
      attachmentRequiredFromDays: 3,
      reminderAfterDays: [1, 4],
      warnUnexcusedLessons: 10,
      warnLessons: 30,
      warnWindowDays: 30,
    }),
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
  /** Offline-Speicher auf Geräten (Spec Abschnitt 12): wird nach so vielen Tagen ohne Nutzung geleert. */
  offline: z
    .object({ clearAfterIdleDays: z.number().int().min(1).max(60).default(14) })
    .default({ clearAfterIdleDays: 14 }),
  retention: z
    .object({
      messagesDays: z.number().int().min(1).default(365),
      absencesDays: z.number().int().min(1).default(1825),
      attachmentsDays: z.number().int().min(1).default(365),
      auditLogDays: z.number().int().min(90).default(1095),
      notificationsDays: z.number().int().min(7).default(180),
      /** Vermerke im Klassenbuch (KB-07). */
      remarksDays: z.number().int().min(30).default(365),
    })
    .default({
      messagesDays: 365,
      absencesDays: 1825,
      attachmentsDays: 365,
      auditLogDays: 1095,
      notificationsDays: 180,
      remarksDays: 365,
    }),
  /** Rundschreiben: einmalige Erinnerung an fehlende Lesebestätigungen nach so vielen Tagen (0 = aus). */
  communication: z
    .object({ announcementReminderAfterDays: z.number().int().min(0).max(30).default(2) })
    .default({ announcementReminderAfterDays: 2 }),
  /** Link auf den vollständigen Datenschutzhinweis der Schule (in der Einführung angezeigt). */
  privacy: z.object({ noticeUrl: z.url().optional() }).default({}),
  /** Stundenplan: Tagesbelastung je Klasse, ab der die weiche Regel DAY_LOAD warnt (SP-06). */
  timetable: z
    .object({ dayLoadMax: z.number().int().min(1).max(12).default(6) })
    .default({ dayLoadMax: 6 }),
  /**
   * Freigeschaltete Pakete (ADR 0012): setzt der Betrieb (pnpm tenant:feature), nicht die Schule selbst; deshalb
   * nicht in tenantSettingsPatch.
   */
  features: z.object({ autoPlanning: z.boolean().default(false) }).default({ autoPlanning: false }),
});
export type TenantSettings = z.infer<typeof tenantSettingsSchema>;

/**
 * Änderung der Schuleinstellungen durch die Administration: ganze Abschnitte, fehlende bleiben unverändert.
 * Ohne die Standardwerte der Abschnitte, sonst würde ein fehlender Abschnitt auf den Standard zurückgesetzt.
 */
const sections = tenantSettingsSchema.shape;
export const tenantSettingsPatch = z.object({
  absence: sections.absence.unwrap().optional(),
  exams: sections.exams.unwrap().optional(),
  ageLimits: sections.ageLimits.unwrap().optional(),
  offline: sections.offline.unwrap().optional(),
  retention: sections.retention.unwrap().optional(),
  communication: sections.communication.unwrap().optional(),
  privacy: sections.privacy.unwrap().optional(),
  security: sections.security.unwrap().optional(),
  timetable: sections.timetable.unwrap().optional(),
});
export type TenantSettingsPatch = z.infer<typeof tenantSettingsPatch>;
