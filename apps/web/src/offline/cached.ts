'use client';
import { ApiError, apiRequest } from '../lib/api-client';
import { readSnapshot, writeSnapshot } from './db';

export interface Cached<T> {
  data: T;
  /** true: Antwort kommt aus dem lokalen Speicher, weil der Server nicht erreichbar war. */
  fromCache: boolean;
  savedAt: number;
}

/** Kein Netz und nichts gespeichert. */
export class OfflineMissError extends Error {
  constructor() {
    super('offline');
  }
}

/** Bis die Prüfung "gehört der Speicher dieser Person?" fertig ist, wird nichts Lokales gelesen. */
let release: () => void = () => undefined;
const ready = new Promise<void>((resolve) => (release = resolve));
export function releaseLocalReads(): void {
  release();
}

/**
 * Netz zuerst, bei fehlender Verbindung (oder Serverausfall) der zuletzt gespeicherte Stand.
 * Fachliche Fehler (401, 403, 404) werden nicht durch alte Daten verdeckt.
 */
export async function fetchCached<T>(key: string, path: string): Promise<Cached<T>> {
  await ready;
  try {
    const data = await apiRequest<T>('GET', path);
    await writeSnapshot(key, data);
    return { data, fromCache: false, savedAt: Date.now() };
  } catch (err) {
    if (err instanceof ApiError && err.problem.status < 500) throw err;
    const snap = await readSnapshot<T>(key);
    if (snap) return { data: snap.data, fromCache: true, savedAt: snap.savedAt };
    throw new OfflineMissError();
  }
}
