'use client';
import Dexie, { type Table } from 'dexie';
import type { OutboxItem } from './mutations';

export interface Snapshot {
  key: string;
  data: unknown;
  savedAt: number;
}

export interface Meta {
  key: string;
  value: unknown;
}

/**
 * Lokaler Speicher (IndexedDB über Dexie): Serverstände für Heute, Plan und Klassenbuch sowie die Outbox.
 * Nur Daten der angemeldeten Person; beim Abmelden und nach längerer Nichtnutzung wird alles gelöscht.
 */
class OfflineDb extends Dexie {
  snapshots!: Table<Snapshot, string>;
  outbox!: Table<OutboxItem, number>;
  meta!: Table<Meta, string>;

  constructor() {
    super('schulplattform');
    this.version(1).stores({
      snapshots: 'key',
      outbox: '++seq, occurrenceId, state',
      meta: 'key',
    });
  }
}

let instance: OfflineDb | null = null;

/** Erst im Browser öffnen (Server-Rendering hat kein IndexedDB). */
export function db(): OfflineDb {
  instance ??= new OfflineDb();
  return instance;
}

export async function readSnapshot<T>(key: string): Promise<(Snapshot & { data: T }) | undefined> {
  return (await db().snapshots.get(key)) as (Snapshot & { data: T }) | undefined;
}

export async function writeSnapshot(key: string, data: unknown): Promise<void> {
  await db().snapshots.put({ key, data, savedAt: Date.now() });
}

export async function getMeta<T>(key: string): Promise<T | undefined> {
  return (await db().meta.get(key))?.value as T | undefined;
}

export async function setMeta(key: string, value: unknown): Promise<void> {
  await db().meta.put({ key, value });
}

/** Alles Lokale löschen: Datenbank und die Seiten-Caches des Service Workers. */
export async function clearOfflineData(): Promise<void> {
  await db().transaction('rw', db().snapshots, db().outbox, db().meta, async () => {
    await db().snapshots.clear();
    await db().outbox.clear();
    await db().meta.clear();
  });
  if (typeof caches !== 'undefined') {
    for (const name of await caches.keys())
      if (name.startsWith('sp-pages')) await caches.delete(name);
  }
}
