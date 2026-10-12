'use client';
import { CloudOff, Check, LoaderCircle, TriangleAlert, WifiOff } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import { Banner, Button, Chip, cn, useToast } from '@sp/ui';
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

/**
 * Offline-Banner oben (Design System, pf-banner): bleibt bis zur Verbindung, zählt wartende Einträge. Nach der
 * Synchronisation meldet ein Toast "Synchronisiert".
 */
export function OfflineBanner() {
  const t = useTranslations('sync');
  const online = useOnline();
  const s = useSyncState();
  const toast = useToast();
  const hadPending = useRef(false);
  useEffect(() => {
    if (s.pending > 0) hadPending.current = true;
    else if (online && hadPending.current && s.failed.length === 0) {
      hadPending.current = false;
      toast({ text: t('synced') });
    }
  }, [online, s.pending, s.failed.length, toast, t]);
  if (online) return null;
  return (
    <div className="px-4 pt-3 lg:px-6">
      <Banner role="status" icon={WifiOff}>
        {t('banner', { count: s.pending })}
      </Banner>
    </div>
  );
}

/** Kleiner Status-Chip in der Topbar: offline oder wartende Einträge. */
export function OfflineChip() {
  const t = useTranslations('nav');
  const online = useOnline();
  const s = useSyncState();
  if (online && s.pending === 0) return null;
  return (
    <Chip tone="late" icon={online ? LoaderCircle : CloudOff}>
      {online ? t('pendingChip', { count: s.pending }) : t('offlineChip')}
    </Chip>
  );
}
