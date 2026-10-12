'use client';
import type { OccurrenceDetail } from '@sp/shared';
import { apiRequest } from '../lib/api-client';
import { db, getMeta, setMeta } from './db';
import { fetchCached } from './cached';
import { occurrenceKey } from './sync';

const EVERY_MS = 5 * 60_000;
let running = false;

/**
 * Offline-Vorrat der Lehrkraft (Spec Abschnitt 12): Termine der nächsten 7 Tage und offene Einträge mit
 * Schülerlisten in IndexedDB, dazu die Seiten im Service-Worker-Cache. Höchstens alle 5 Minuten.
 */
export async function prefetchTeacher(force = false): Promise<void> {
  if (running || !navigator.onLine) return;
  running = true;
  try {
    const last = await getMeta<number>('prefetchAt');
    if (!force && last && Date.now() - last < EVERY_MS) return;
    const res = await apiRequest<{ data: OccurrenceDetail[] }>('GET', '/classbook/prefetch');
    const savedAt = Date.now();
    await db().snapshots.bulkPut(
      res.data.map((d) => ({ key: occurrenceKey(d.id), data: d, savedAt })),
    );
    await fetchCached('classbook:open', '/classbook/open').catch(() => undefined);
    await setMeta('prefetchAt', savedAt);
    const sw = navigator.serviceWorker?.controller;
    sw?.postMessage({
      type: 'cache-pages',
      urls: ['/heute', '/klassenbuch', ...res.data.map((d) => `/klassenbuch/${d.id}`)],
    });
  } catch {
    // ohne Verbindung oder ohne Recht: beim nächsten Mal
  } finally {
    running = false;
  }
}

const PLAN_EVERY_MS = 30 * 60_000;

/**
 * Stundenplan offline (Spec Abschnitt 12, alle Rollen): diese und nächste Woche als Seiten im
 * Service-Worker-Cache, damit die nächsten 7 Tage ohne Verbindung sichtbar sind. Höchstens alle 30 Minuten.
 */
export async function cachePlanPages(nextMonday: string): Promise<void> {
  try {
    const sw = navigator.serviceWorker?.controller;
    if (!sw || !navigator.onLine) return;
    const last = await getMeta<number>('planCachedAt');
    if (last && Date.now() - last < PLAN_EVERY_MS) return;
    sw.postMessage({
      type: 'cache-pages',
      refresh: true,
      urls: ['/plan', `/plan?from=${nextMonday}`],
    });
    await setMeta('planCachedAt', Date.now());
  } catch {
    // kein Service Worker oder kein lokaler Speicher: nur online
  }
}
