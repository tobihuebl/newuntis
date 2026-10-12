'use client';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { createContext, useContext, useEffect, useState } from 'react';
import { releaseLocalReads } from '../offline/cached';
import { clearOfflineData, getMeta, setMeta } from '../offline/db';
import { sync } from '../offline/sync';

interface Session {
  csrfToken: string;
  personId: string;
  tenantSlug: string;
  /** Lokaler Speicher geprüft (gehört dieser Person, nicht abgelaufen). */
  offlineReady: boolean;
}
const SessionContext = createContext<Session>({
  csrfToken: '',
  personId: '',
  tenantSlug: '',
  offlineReady: false,
});
export const useSession = () => useContext(SessionContext);

const DAY = 86_400_000;

/**
 * Lokaler Speicher gehört genau einer Person einer Schule. Andere Person oder lange nicht genutzt:
 * alles löschen, bevor etwas Lokales angezeigt wird (Spec Abschnitt 12, Datenschutz auf dem Gerät).
 */
async function bootOffline(owner: string, clearAfterIdleDays: number): Promise<void> {
  try {
    const [prev, lastActive] = await Promise.all([
      getMeta<string>('owner'),
      getMeta<number>('lastActive'),
    ]);
    const idle = lastActive !== undefined && Date.now() - lastActive > clearAfterIdleDays * DAY;
    if ((prev !== undefined && prev !== owner) || idle) await clearOfflineData();
    await setMeta('owner', owner);
    await setMeta('lastActive', Date.now());
  } catch {
    // IndexedDB nicht verfügbar (z. B. privater Modus): App funktioniert online weiter
  }
}

/** Server-Sent Events: Hinweise mit Ids, betroffene Abfragen werden neu geladen (Spec Abschnitt 9). */
function EventStream() {
  const qc = useQueryClient();
  const router = useRouter();
  useEffect(() => {
    if (typeof EventSource === 'undefined') return;
    let es: EventSource | null = null;
    let broken = false;
    let reopen: ReturnType<typeof setTimeout> | null = null;
    const everything = () => {
      void qc.invalidateQueries();
      router.refresh();
    };
    const open = () => {
      es?.close();
      es = new EventSource('/api/v1/events');
      es.addEventListener('open', () => {
        if (broken) everything(); // verpasste Ereignisse nachholen
        broken = false;
      });
      es.addEventListener('error', () => {
        broken = true;
        // Bei einer Fehlerantwort (z. B. 401) verbindet der Browser nicht selbst neu
        if (es?.readyState === EventSource.CLOSED) reopen = setTimeout(open, 30_000);
      });
      es.addEventListener('occurrence.updated', (e) => {
        const { ids } = JSON.parse((e as MessageEvent<string>).data) as { ids: string[] };
        for (const id of ids) void qc.invalidateQueries({ queryKey: ['occurrence', id] });
        void qc.invalidateQueries({ queryKey: ['today'] });
        void qc.invalidateQueries({ queryKey: ['classbook'] });
      });
      es.addEventListener('notification.new', () => {
        void qc.invalidateQueries({ queryKey: ['notifications'] });
      });
      es.addEventListener('absence.reviewed', () => {
        void qc.invalidateQueries({ queryKey: ['absences'] });
      });
      for (const type of ['timetable.published', 'substitution.published', 'resync'])
        es.addEventListener(type, everything);
    };
    const online = () => {
      if (!es || es.readyState === EventSource.CLOSED) open();
    };
    open();
    window.addEventListener('online', online);
    return () => {
      window.removeEventListener('online', online);
      if (reopen) clearTimeout(reopen);
      es?.close();
    };
  }, [qc, router]);
  return null;
}

/** Service Worker nur im Produktionsbetrieb (im Entwicklungsmodus stört er das Neuladen). */
function registerServiceWorker() {
  if (
    typeof navigator === 'undefined' ||
    !('serviceWorker' in navigator) ||
    (process.env.NODE_ENV !== 'production' && process.env.NEXT_PUBLIC_ENABLE_SW !== '1')
  )
    return;
  void navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => undefined);
}

export function AppProviders({
  csrfToken,
  personId,
  tenantSlug,
  clearAfterIdleDays,
  children,
}: {
  csrfToken: string;
  personId: string;
  tenantSlug: string;
  clearAfterIdleDays: number;
  children: React.ReactNode;
}) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // queryFn fällt selbst auf den lokalen Speicher zurück, darum auch offline ausführen
            networkMode: 'always',
            staleTime: 30_000,
            retry: false,
            refetchOnWindowFocus: true,
          },
        },
      }),
  );
  const [offlineReady, setOfflineReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void bootOffline(`${tenantSlug}:${personId}`, clearAfterIdleDays).then(() => {
      releaseLocalReads();
      if (!cancelled) setOfflineReady(true);
    });
    registerServiceWorker();
    return () => {
      cancelled = true;
    };
  }, [tenantSlug, personId, clearAfterIdleDays]);

  useEffect(() => {
    if (!offlineReady) return;
    return sync.configure(csrfToken, (_ids, reload) => {
      for (const id of reload) void client.invalidateQueries({ queryKey: ['occurrence', id] });
      void client.invalidateQueries({ queryKey: ['today'] });
      void client.invalidateQueries({ queryKey: ['classbook'] });
    });
  }, [csrfToken, client, offlineReady]);

  return (
    <SessionContext.Provider value={{ csrfToken, personId, tenantSlug, offlineReady }}>
      <QueryClientProvider client={client}>
        <EventStream />
        {children}
      </QueryClientProvider>
    </SessionContext.Provider>
  );
}
