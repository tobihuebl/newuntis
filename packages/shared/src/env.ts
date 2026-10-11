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
  SMTP_URL: z.string().min(1),
  S3_ENDPOINT: z.url(),
  S3_BUCKET: z.string().min(1),
  S3_ACCESS_KEY: z.string().min(1),
  S3_SECRET_KEY: z.string().min(1),
  DEFAULT_TIMEZONE: z.string().default('Europe/Vienna'),
});
export type ServerEnv = z.infer<typeof serverEnvSchema>;

export function parseServerEnv(source: Record<string, string | undefined>): ServerEnv {
  return serverEnvSchema.parse(source);
}
