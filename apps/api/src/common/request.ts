import type { Role, TenantSettings } from '@sp/shared';
import type { SessionStage } from '@sp/db';

export interface TenantInfo {
  id: string;
  slug: string;
  name: string;
  settings: TenantSettings;
}

export interface Principal {
  sessionId: string;
  stage: SessionStage;
  csrfToken: string;
  userId: string;
  personId: string;
  email: string | null;
  username: string | null;
  avatar: string | null;
  firstName: string;
  lastName: string;
  roles: { role: Role; classId: string | null }[];
  totpEnabled: boolean;
}

declare module 'fastify' {
  interface FastifyRequest {
    tenant?: TenantInfo;
    principal?: Principal;
  }
}
