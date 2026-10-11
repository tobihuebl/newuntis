import 'server-only';
import { redirect } from 'next/navigation';
import { isRouteAllowed, navigationFor, type MeResponse } from '@sp/shared';
import { getMe } from './api-server';

/** Stellt sicher, dass eine Person angemeldet ist und die Route öffnen darf; sonst Umleitung. */
export async function requireRoute(pathname: string): Promise<MeResponse> {
  const result = await getMe();
  if (!result.ok) redirect('/login');
  const { me } = result;
  if (me.stage === 'NEEDS_2FA_VERIFY') redirect('/2fa');
  if (me.stage === 'NEEDS_2FA_SETUP') redirect('/2fa/einrichten');
  const nav = navigationFor(me.user.roles.map((r) => r.role));
  if (!isRouteAllowed(nav, pathname)) redirect(nav.home);
  return me;
}
