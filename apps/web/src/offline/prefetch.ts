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
