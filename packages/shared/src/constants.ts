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

/** Standard-Unterrichtsraster (Vorlage beim Anlegen einer Schule und im Seed). */
export const DEFAULT_PERIODS = [
  { number: 1, startTime: '08:00', endTime: '08:50', blocksDouble: false },
  { number: 2, startTime: '08:55', endTime: '09:45', blocksDouble: true },
  { number: 3, startTime: '10:00', endTime: '10:50', blocksDouble: false },
  { number: 4, startTime: '10:55', endTime: '11:45', blocksDouble: true },
  { number: 5, startTime: '11:50', endTime: '12:40', blocksDouble: false },
  { number: 6, startTime: '12:45', endTime: '13:35', blocksDouble: false },
  { number: 7, startTime: '13:40', endTime: '14:30', blocksDouble: false },
  { number: 8, startTime: '14:35', endTime: '15:25', blocksDouble: false },
] as const;
