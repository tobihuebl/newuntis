'use client';
import { Bell } from 'lucide-react';
import Link from 'next/link';
import { useApi } from '../../lib/use-api';
import { useT } from '../../lib/i18n';

/** Glocke in der Kopfzeile mit Zahl der ungelesenen Hinweise (aktualisiert über den Echtzeit-Stream). */
export function NotificationBell() {
  const t = useT('notifications');
  const q = useApi<{ unread: number }>(['notifications', 'unread'], '/notifications?limit=1');
  const unread = q.data?.unread ?? 0;
  return (
    <Link
      href="/benachrichtigungen"
      aria-label={t('bell', { count: unread })}
      className="relative inline-flex size-(--tap-min) items-center justify-center rounded-md text-ink-muted hover:bg-brand-soft hover:text-ink"
    >
      <Bell aria-hidden="true" className="size-5" />
      {unread > 0 ? (
        <span
          aria-hidden="true"
          className="absolute top-0.5 right-0.5 min-w-5 rounded-pill bg-brand px-1 text-center text-caption text-on-brand"
        >
          {unread > 99 ? '99+' : unread}
        </span>
      ) : null}
    </Link>
  );
}
