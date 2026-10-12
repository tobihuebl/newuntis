import type { Role } from '@sp/shared';

/** Sie für Eltern, Direktion und Administration; du für Schüler:innen und Lehrkräfte (Design System). */
export function isFormalView(view: Role | null): boolean {
  return view === null || view === 'GUARDIAN' || view === 'PRINCIPAL' || view === 'ADMIN';
}
