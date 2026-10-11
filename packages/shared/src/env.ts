import { z } from 'zod';

export const serverEnvSchema = z.object({
  DATABASE_URL: z.string().min(1),
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
