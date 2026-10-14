import 'server-only';
import { notFound, redirect } from 'next/navigation';
import { isKnownRoute, isRouteAllowed, type MeResponse } from '@sp/shared';
import { getMe } from './api-server';
import { navigationOf } from './nav-server';

/**
 * Stellt sicher, dass eine Person angemeldet ist und die Route öffnen darf. Unbekannte Routen zeigen die 404,
 * bekannte, aber nicht erlaubte "Kein Zugriff" (Design System, Fehler- und Sonderseiten).
 */
export async function requireRoute(pathname: string): Promise<MeResponse> {
  const result = await getMe();
  if (!result.ok) redirect('/login');
  const { me } = result;
  if (me.stage === 'NEEDS_2FA_VERIFY') redirect('/2fa');
  if (me.stage === 'NEEDS_2FA_SETUP') redirect('/2fa/einrichten');
  const nav = await navigationOf(me);
  if (!isRouteAllowed(nav, pathname)) {
    if (!isKnownRoute(pathname)) notFound();
    redirect('/kein-zugriff');
  }
  return me;
}

/** Vermerke einer Klasse (KB-07): Klassenvorstand dieser Klasse und Direktion, nicht die Administration. */
export function canSeeRemarks(me: MeResponse, classId: string): boolean {
  return me.user.roles.some(
    (r) => r.role === 'PRINCIPAL' || (r.role === 'HOMEROOM' && r.classId === classId),
  );
}
