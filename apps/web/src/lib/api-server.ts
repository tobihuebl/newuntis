import 'server-only';
import { cache } from 'react';
import { cookies, headers } from 'next/headers';
import { SESSION_COOKIE, meResponseSchema, type MeResponse } from '@sp/shared';

const API = process.env.API_URL ?? 'http://localhost:4000';

/** Ruft die API aus einer Server-Komponente auf, im Namen der Schule (Host) und der Sitzung des Browsers. */
export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const h = await headers();
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return fetch(`${API}/api/v1${path}`, {
    ...init,
    cache: 'no-store',
    headers: {
      ...init.headers,
      'x-forwarded-host': h.get('host') ?? '',
      'x-forwarded-proto': h.get('x-forwarded-proto') ?? 'http',
      ...(token ? { cookie: `${SESSION_COOKIE}=${token}` } : {}),
    },
  });
}

export type MeResult = { ok: true; me: MeResponse } | { ok: false; status: number };

/** Pro Render nur ein Aufruf (Layout und Seite teilen das Ergebnis). */
export const getMe = cache(async (): Promise<MeResult> => {
  try {
    const res = await apiFetch('/me');
    if (!res.ok) return { ok: false, status: res.status };
    return { ok: true, me: meResponseSchema.parse(await res.json()) };
  } catch {
    return { ok: false, status: 503 };
  }
});

/** GET aus einer Server-Komponente; ein Fehlerstatus wird zur Ausnahme (Next zeigt die Fehlerseite). */
export async function apiGet<T>(path: string): Promise<T> {
  const res = await apiFetch(path);
  if (!res.ok) throw new Error(`API ${path}: ${res.status}`);
  return (await res.json()) as T;
}
