import 'server-only';
import { cookies } from 'next/headers';
import { getTranslations } from 'next-intl/server';
import { navigationFor, type MeResponse, type Navigation } from '@sp/shared';
import { getMe } from './api-server';
import { isFormalView } from './formal';
import { withFormal } from './i18n-core';
import { ROLE_COOKIE } from './role-view';

/** Navigation der angemeldeten Person in der gewählten Ansicht (Cookie pf-role, sonst wichtigste Rolle). */
export async function navigationOf(me: MeResponse): Promise<Navigation> {
  const preferred = (await cookies()).get(ROLE_COOKIE)?.value;
  const roles = [...new Set(me.user.roles.map((r) => r.role))];
  return navigationFor(roles, preferred ? decodeURIComponent(preferred) : null);
}

/** Anrede der angemeldeten Person (Sie ohne Anmeldung). */
export async function formalOf(): Promise<boolean> {
  const r = await getMe();
  return r.ok ? isFormalView((await navigationOf(r.me)).view) : true;
}

/** Wie getTranslations, mit Anrede-Parameter formal für Server-Komponenten. */
export async function getT(namespace?: string) {
  const t = await getTranslations(namespace);
  return withFormal(t, (await formalOf()) ? 'yes' : 'no');
}
