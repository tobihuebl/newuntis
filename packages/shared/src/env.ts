import { z } from 'zod';

export const serverEnvSchema = z.object({
  DATABASE_URL: z.string().min(1),
  DATABASE_APP_URL: z.string().min(1),
  BASE_DOMAIN: z.string().min(1),
  /** 32 Byte, base64: verschlüsselt TOTP-Geheimnisse. */
  ENCRYPTION_KEY: z.string().refine((v) => {
    try {
      return atob(v).length === 32;
    } catch {
      return false;
    }
  }, '32 Byte base64 erwartet'),
  SESSION_SECRET: z.string().min(32),
  APP_URL: z.url(),
  API_URL: z.url(),
  VAPID_PUBLIC_KEY: z.string().optional(),
  VAPID_PRIVATE_KEY: z.string().optional(),
  /** Kontakt für Push-Dienste (mailto: oder https:). */
  VAPID_SUBJECT: z.string().optional(),
  /** Virenscan für Uploads (clamd), z. B. tcp://localhost:3310. */
  CLAMAV_URL: z.string().optional(),
  /** Bearer-Token für GET /metrics; ohne Wert ist der Endpunkt aus. */
  METRICS_TOKEN: z.preprocess((v) => (v === '' ? undefined : v), z.string().min(24).optional()),
  /** Uploads ohne Virenscan ablehnen (Standard in Produktion). */
  UPLOADS_REQUIRE_SCAN: z.enum(['true', 'false']).optional(),
  SMTP_URL: z.string().min(1),
  S3_ENDPOINT: z.url(),
  S3_BUCKET: z.string().min(1),
  S3_ACCESS_KEY: z.string().min(1),
  S3_SECRET_KEY: z.string().min(1),
  DEFAULT_TIMEZONE: z.string().default('Europe/Vienna'),
  /**
   * Stundenplan-Assistent (ADR 0012): Wünsche in Worten zusätzlich über das Vercel AI Gateway übersetzen
   * (EU-Region, Zero Data Retention). Ohne Schlüssel nur der regelbasierte Übersetzer.
   */
  AI_GATEWAY_API_KEY: z.preprocess(
    (v) => (v === '' ? undefined : v),
    z.string().min(10).optional(),
  ),
  AI_GATEWAY_MODEL: z.string().default('anthropic/claude-sonnet-5.5'),
});
export type ServerEnv = z.infer<typeof serverEnvSchema>;

export function parseServerEnv(source: Record<string, string | undefined>): ServerEnv {
  return serverEnvSchema.parse(source);
}
