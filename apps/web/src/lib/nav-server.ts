import 'server-only';
import { cookies } from 'next/headers';
import { navigationFor, type MeResponse, type Navigation } from '@sp/shared';
import { ROLE_COOKIE } from './role-view';

/** Navigation der angemeldeten Person in der gewählten Ansicht (Cookie pf-role, sonst wichtigste Rolle). */
export async function navigationOf(me: MeResponse): Promise<Navigation> {
  const preferred = (await cookies()).get(ROLE_COOKIE)?.value;
  const roles = [...new Set(me.user.roles.map((r) => r.role))];
  return navigationFor(roles, preferred ? decodeURIComponent(preferred) : null);
}
