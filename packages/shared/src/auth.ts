import { z } from 'zod';
import { ROLES } from './constants';

export const passwordSchema = z.string().min(12, 'Mindestens 12 Zeichen').max(128);
export const emailSchema = z.string().trim().toLowerCase().max(254).pipe(z.email());

export const loginSchema = z.object({ email: emailSchema, password: z.string().min(1).max(128) });
export type LoginInput = z.infer<typeof loginSchema>;

/** 6-stelliger TOTP-Code oder Wiederherstellungscode (Format XXXXX-XXXXX). */
export const twoFactorVerifySchema = z.object({
  code: z
    .string()
    .trim()
    .regex(/^(\d{6}|[A-Za-z0-9]{5}-[A-Za-z0-9]{5})$/),
});
export type TwoFactorVerifyInput = z.infer<typeof twoFactorVerifySchema>;

export const twoFactorEnableSchema = z.object({
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/),
});

export const inviteAcceptSchema = z.object({
  token: z.string().min(20).max(200),
  password: passwordSchema,
});
export type InviteAcceptInput = z.infer<typeof inviteAcceptSchema>;
export const passwordResetRequestSchema = z.object({ email: emailSchema });
export const passwordResetSchema = z.object({
  token: z.string().min(20).max(200),
  password: passwordSchema,
});

export const SESSION_STAGES = ['ACTIVE', 'NEEDS_2FA_VERIFY', 'NEEDS_2FA_SETUP'] as const;
export type SessionStageName = (typeof SESSION_STAGES)[number];

export const meResponseSchema = z.object({
  stage: z.enum(SESSION_STAGES),
  csrfToken: z.string(),
  user: z.object({
    id: z.string(),
    personId: z.string(),
    email: z.string(),
    firstName: z.string(),
    lastName: z.string(),
    roles: z.array(z.object({ role: z.enum(ROLES), classId: z.string().nullable() })),
    twoFactorEnabled: z.boolean(),
  }),
  tenant: z.object({ slug: z.string(), name: z.string() }),
});
export type MeResponse = z.infer<typeof meResponseSchema>;

export const CSRF_HEADER = 'x-csrf-token';
export const SESSION_COOKIE = 'sp_session';
