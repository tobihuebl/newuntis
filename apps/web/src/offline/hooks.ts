'use client';
import { useQuery } from '@tanstack/react-query';
import { useLiveQuery } from 'dexie-react-hooks';
import { useSyncExternalStore } from 'react';
import type { OccurrenceDetail } from '@sp/shared';
import { useSession } from '../components/providers';
import { fetchCached } from './cached';
import { db, readSnapshot } from './db';
import { applyPending, type OutboxItem } from './mutations';
import { occurrenceKey, sync } from './sync';

/** Abfrage mit Rückfall auf den lokalen Stand (Heute, Klassenbuch-Listen). */
export function useCached<T>(queryKey: readonly unknown[], key: string, path: string) {
  const { offlineReady } = useSession();
  return useQuery({
    queryKey,
    queryFn: () => fetchCached<T>(key, path),
    enabled: offlineReady,
  });
}

const NO_ITEMS: OutboxItem[] = [];

export function useOutbox(occurrenceId?: string): OutboxItem[] {
  const { offlineReady } = useSession();
  return (
    useLiveQuery(
      () =>
        !offlineReady
          ? NO_ITEMS
          : occurrenceId
            ? db().outbox.where('occurrenceId').equals(occurrenceId).sortBy('seq')
            : db().outbox.orderBy('seq').toArray(),
      [occurrenceId, offlineReady],
    ) ?? NO_ITEMS
  );
}

/**
 * Klassenbuch-Termin: Quelle ist der lokale Serverstand (Dexie), darüber liegen die eigenen, noch nicht
 * bestätigten Änderungen. Die Netzabfrage aktualisiert nur den lokalen Stand.
 */
export function useOccurrence(id: string) {
  const { offlineReady } = useSession();
  const query = useQuery({
    queryKey: ['occurrence', id],
    queryFn: () =>
      fetchCached<OccurrenceDetail>(occurrenceKey(id), `/occurrences/${encodeURIComponent(id)}`),
    enabled: offlineReady,
  });
  const snapshot = useLiveQuery(
    () => (offlineReady ? readSnapshot<OccurrenceDetail>(occurrenceKey(id)) : undefined),
    [id, offlineReady],
  );
  const outbox = useOutbox(id);
  const base = snapshot?.data ?? query.data?.data;
  return {
    detail: base ? applyPending(base, outbox) : undefined,
    server: base,
    outbox,
    savedAt: snapshot?.savedAt ?? query.data?.savedAt ?? null,
    fromCache: query.data?.fromCache ?? false,
    query,
  };
}

/** Verbindungs- und Sendestatus für die Statusanzeige. */
export function useSyncState() {
  const engine = useSyncExternalStore(sync.subscribe, sync.getState, sync.getState);
  const items = useOutbox();
  return {
    ...engine,
    pending: items.filter((o) => o.state === 'pending' || o.state === 'sending').length,
    failed: items.filter((o) => o.state === 'failed'),
    conflicts: items.filter((o) => o.state === 'conflict'),
  };
}
