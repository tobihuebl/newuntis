'use client';
import { Bell } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useApi } from '../../lib/use-api';

/** Glocke in der Kopfzeile mit Zahl der ungelesenen Hinweise (aktualisiert über den Echtzeit-Stream). */
export function NotificationBell() {
  const t = useTranslations('notifications');
  const q = useApi<{ unread: number }>(['notifications', 'unread'], '/notifications?limit=1');
  const unread = q.data?.unread ?? 0;
  return (
    <Link
      href="/benachrichtigungen"
      aria-label={t('bell', { count: unread })}
      className="relative inline-flex min-h-11 min-w-11 items-center justify-center rounded-sm text-muted hover:bg-surface-2 hover:text-text"
    >
      <Bell aria-hidden="true" size={20} />
      {unread > 0 ? (
        <span
          aria-hidden="true"
          className="absolute right-1 top-1 min-w-5 rounded-full bg-danger px-1 text-center text-[11px] font-semibold leading-5 text-on-primary tabular-nums"
        >
          {unread > 99 ? '99+' : unread}
        </span>
      ) : null}
    </Link>
  );
}
