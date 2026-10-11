import { SetMetadata } from '@nestjs/common';
import type { Action, SessionStageName } from '@sp/shared';

export const NO_TENANT = 'sp:noTenant';
export const PUBLIC = 'sp:public';
export const AUTHENTICATED = 'sp:authenticated';
export const CAN = 'sp:can';
export const ALLOW_STAGES = 'sp:allowStages';
export const NO_TRANSACTION = 'sp:noTransaction';
export const RATE_LIMIT = 'sp:rateLimit';

/** Route ohne Mandant (Health-Checks). */
export const NoTenant = () => SetMetadata(NO_TENANT, true);
/** Route ohne Anmeldung (Login, Einladung, Passwort-Reset). */
export const Public = () => SetMetadata(PUBLIC, true);
/** Route für jede angemeldete Person ohne besondere Aktion (z. B. eigenes Profil). */
export const Authenticated = () => SetMetadata(AUTHENTICATED, true);
/** Route braucht die Aktion aus der Rechte-Matrix. Die Prüfung macht ausschließlich das policy-Modul. */
export const Can = (action: Action) => SetMetadata(CAN, action);
/** Erlaubt Sitzungen in einer Vorstufe (z. B. TOTP-Code fehlt noch). Standard: nur ACTIVE. */
export const AllowStages = (...stages: SessionStageName[]) => SetMetadata(ALLOW_STAGES, stages);
/** Keine Sammeltransaktion um den Handler; der Dienst steuert seine Transaktionen selbst. */
export const NoTransaction = () => SetMetadata(NO_TRANSACTION, true);
/** Einfache Ratenbegrenzung pro IP und Route. */
export const RateLimit = (limit: number, windowSeconds: number) =>
  SetMetadata(RATE_LIMIT, { limit, windowSeconds });
