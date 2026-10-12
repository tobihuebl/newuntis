import type { Env } from '../config/env';

/** Öffentliche URL einer Seite der Schule: Subdomain + BASE_DOMAIN, Protokoll und Port aus APP_URL. */
export function tenantAppUrl(env: Env, slug: string, path: string): string {
  const base = new URL(env.APP_URL);
  return `${base.protocol}//${slug}.${env.BASE_DOMAIN}${base.port ? `:${base.port}` : ''}${path}`;
}
