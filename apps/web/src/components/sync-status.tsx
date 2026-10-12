'use client';
import { CloudOff, Check, LoaderCircle, TriangleAlert, WifiOff } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { Button, cn } from '@sp/ui';
import { useSyncState } from '../offline/hooks';
import { sync } from '../offline/sync';

/** Verbindung laut Browser; reagiert auf online/offline-Ereignisse. */
export function useOnline(): boolean {
  const [online, setOnline] = useState(true);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);
  return online;
}

/**
 * Immer sichtbarer Speicherstatus (Spec Abschnitt 6 und 12): gespeichert, wartet auf Verbindung (Anzahl),
 * wird synchronisiert, Fehler mit Wiederholen. Änderungen werden per aria-live angesagt.
 */
export function SyncStatus({ className }: { className?: string }) {
  const t = useTranslations('sync');
  const online = useOnline();
  const s = useSyncState();
  let tone: 'ok' | 'busy' | 'warn' | 'error' = 'ok';
  let Icon = Check;
  let text = s.lastSyncedAt ? t('synced') : t('saved');
  if (s.authExpired) {
    tone = 'error';
    Icon = TriangleAlert;
    text = t('authExpired');
  } else if (s.failed.length > 0) {
    tone = 'error';
    Icon = TriangleAlert;
    text = t('failed', { count: s.failed.length });
  } else if (!online) {
    tone = 'warn';
    Icon = CloudOff;
    text = t('offline', { count: s.pending });
  } else if (s.sending || s.pending > 0) {
    tone = 'busy';
    Icon = LoaderCircle;
    text = s.sending ? t('sending') : t('waiting', { count: s.pending });
  }
  return (
    <div
      className={cn(
        'flex min-h-11 flex-wrap items-center gap-2 text-body-sm',
        tone === 'ok' && 'text-brand-text',
        tone === 'busy' && 'text-ink-muted',
        tone === 'warn' && 'text-signal-ink',
        tone === 'error' && 'text-danger-ink',
        className,
      )}
      data-sync-state={tone}
      data-pending={s.pending}
    >
      <p role="status" aria-live="polite" className="flex items-center gap-2">
        <Icon
          aria-hidden="true"
          size={16}
          className={cn(tone === 'busy' && 'motion-safe:animate-spin')}
        />
        <span>{text}</span>
      </p>
      {s.authExpired ? (
        <Button variant="secondary" asChild>
          <Link href="/login">{t('login')}</Link>
        </Button>
      ) : null}
      {!s.authExpired && online && s.pending > 0 && !s.sending ? (
        <Button variant="ghost" onClick={() => void sync.process()}>
          {t('retry')}
        </Button>
      ) : null}
    </div>
  );
}

/** Hinweis oben bei fehlender Verbindung (Spec Abschnitt 6: Zustand "Offline"). */
export function OfflineBanner() {
  const t = useTranslations('sync');
  const online = useOnline();
  if (online) return null;
  return (
    <div
      role="status"
      className="flex items-center gap-2 border-b border-signal bg-bg-raised px-4 py-2 text-body-sm text-signal-ink"
    >
      <WifiOff aria-hidden="true" size={16} />
      <span>{t('banner')}</span>
    </div>
  );
}
