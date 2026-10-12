'use client';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, CheckCircle2 } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import type { AnnouncementDetail } from '@sp/shared';
import { Button, Card, EmptyState, Skeleton } from '@sp/ui';
import { apiRequest } from '../../lib/api-client';
import { dateTimeOf } from '../../lib/dates';
import { useApi, useProblemText } from '../../lib/use-api';
import { useSession } from '../providers';

/**
 * Rundschreiben lesen (Empfänger:innen). Ohne Lesebestätigung gilt das Öffnen als gelesen,
 * mit Lesebestätigung braucht es den ausdrücklichen Klick.
 */
export function AnnouncementView({ id }: { id: string }) {
  const t = useTranslations('messages');
  const tc = useTranslations('common');
  const problem = useProblemText();
  const { csrfToken } = useSession();
  const qc = useQueryClient();
  const q = useApi<AnnouncementDetail>(['announcement', id], `/announcements/${id}`);
  const [busy, setBusy] = useState(false);
  const a = q.data;

  const confirm = async () => {
    setBusy(true);
    try {
      await apiRequest('POST', `/announcements/${id}/read`, undefined, csrfToken);
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['announcement', id] }),
        qc.invalidateQueries({ queryKey: ['announcements'] }),
        qc.invalidateQueries({ queryKey: ['inbox'] }),
        qc.invalidateQueries({ queryKey: ['today'] }),
      ]);
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (a && a.isRecipient && !a.requiresRead && !a.readAt) void confirm();
    // nur beim ersten Laden des Rundschreibens (confirm hängt allein von der Id ab)
  }, [a?.id]);

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4 p-4">
      <Button variant="ghost" asChild className="self-start">
        <Link href="/nachrichten?ansicht=rundschreiben">
          <ArrowLeft aria-hidden="true" size={18} />
          {t('back')}
        </Link>
      </Button>
      {q.isPending ? (
        <Skeleton className="h-64 w-full" />
      ) : !a ? (
        <Card>
          <EmptyState title={problem(q.error) ?? tc('error')} />
        </Card>
      ) : (
        <article className="flex flex-col gap-4">
          <header>
            <h1 className="text-h1 break-words">{a.title}</h1>
            <p className="text-body-sm text-ink-muted">
              {a.author} · <time dateTime={a.publishedAt}>{dateTimeOf(a.publishedAt)}</time>
            </p>
          </header>
          <Card>
            <p className="whitespace-pre-wrap break-words">{a.body}</p>
          </Card>
          {a.isRecipient && a.requiresRead ? (
            a.readAt ? (
              <p role="status" className="flex items-center gap-2 text-body-sm text-brand-text">
                <CheckCircle2 aria-hidden="true" size={18} />
                {t('confirmedAt', { time: dateTimeOf(a.readAt) })}
              </p>
            ) : (
              <Card className="flex flex-col gap-3 border-signal">
                <p className="text-body-sm">{t('confirmText')}</p>
                <Button onClick={() => void confirm()} disabled={busy} className="self-start">
                  <CheckCircle2 aria-hidden="true" size={18} />
                  {t('confirm')}
                </Button>
              </Card>
            )
          ) : null}
        </article>
      )}
    </div>
  );
}
