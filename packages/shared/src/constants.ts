export const DEFAULT_TIMEZONE = 'Europe/Vienna';
export const DEFAULT_LOCALE = 'de-AT';

export const ROLES = ['STUDENT', 'GUARDIAN', 'TEACHER', 'HOMEROOM', 'PRINCIPAL', 'ADMIN'] as const;
export type Role = (typeof ROLES)[number];

/** Rollen, für die TOTP-Zwei-Faktor Pflicht ist (PL-02). */
export const TWO_FACTOR_REQUIRED_ROLES: readonly Role[] = [
  'TEACHER',
  'HOMEROOM',
  'PRINCIPAL',
  'ADMIN',
];

export const WEEK_PATTERNS = ['EVERY', 'A', 'B'] as const;
export type WeekPattern = (typeof WEEK_PATTERNS)[number];
