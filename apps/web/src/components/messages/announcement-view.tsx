'use client';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, CheckCircle2 } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { AnnouncementDetail } from '@sp/shared';
import { Button, Card, EmptyState, Skeleton } from '@sp/ui';
import { apiRequest } from '../../lib/api-client';
import { dateTimeOf } from '../../lib/dates';
import { useApi, useProblemText } from '../../lib/use-api';
import { useSession } from '../providers';
import { useT } from '../../lib/i18n';
import { PageTitle } from '../page-title';

/**
 * Rundschreiben lesen (Empfänger:innen). Ohne Lesebestätigung gilt das Öffnen als gelesen,
 * mit Lesebestätigung braucht es den ausdrücklichen Klick.
 */
export function AnnouncementView({ id }: { id: string }) {
  const t = useT('messages');
  const tc = useT('common');
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
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 pt-4 pb-8 lg:px-6 lg:pt-6">
      <Button variant="ghost" asChild className="self-start" iconLeft={ArrowLeft}>
        <Link href="/nachrichten?ansicht=rundschreiben">{t('back')}</Link>
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
            <PageTitle area="kommunikation">{a.title}</PageTitle>
            <p className="text-body-sm text-ink-muted">
              {a.author} · <time dateTime={a.publishedAt}>{dateTimeOf(a.publishedAt)}</time>
            </p>
          </header>
          <Card>
            <p className="text-body break-words whitespace-pre-wrap">{a.body}</p>
          </Card>
          {a.isRecipient && a.requiresRead ? (
            a.readAt ? (
              <p role="status" className="flex items-center gap-2 text-body-sm text-brand-text">
                <CheckCircle2 aria-hidden="true" className="size-4.5" />
                {t('confirmedAt', { time: dateTimeOf(a.readAt) })}
              </p>
            ) : (
              <Card tone="signal" flat className="flex flex-col gap-3">
                <p className="text-body-sm">{t('confirmText')}</p>
                <Button
                  onClick={() => void confirm()}
                  loading={busy}
                  iconLeft={CheckCircle2}
                  className="self-start"
                >
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
