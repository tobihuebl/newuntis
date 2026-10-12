'use client';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Send } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import type { ThreadDetail } from '@sp/shared';
import { Button, Card, EmptyState, Skeleton, Textarea, cn } from '@sp/ui';
import { apiRequest } from '../../lib/api-client';
import { dateTimeOf } from '../../lib/dates';
import { useApi, useProblemText } from '../../lib/use-api';
import { useSession } from '../providers';

/** Ein Gespräch: Verlauf, Antworten; beim Öffnen und bei neuen Nachrichten als gelesen markiert. */
export function ThreadScreen({ id }: { id: string }) {
  const t = useTranslations('messages');
  const tc = useTranslations('common');
  const problem = useProblemText();
  const { csrfToken, personId } = useSession();
  const qc = useQueryClient();
  const q = useApi<ThreadDetail>(['thread', id], `/threads/${id}`);
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const end = useRef<HTMLDivElement>(null);
  const count = q.data?.messages.length ?? 0;

  useEffect(() => {
    if (!q.data) return;
    void apiRequest('POST', `/threads/${id}/read`, undefined, csrfToken)
      .then(() => {
        void qc.invalidateQueries({ queryKey: ['threads'] });
        void qc.invalidateQueries({ queryKey: ['inbox'] });
      })
      .catch(() => undefined);
    end.current?.scrollIntoView({ block: 'end' });
  }, [id, count, q.data, csrfToken, qc]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!body.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await apiRequest('POST', `/threads/${id}/messages`, { body }, csrfToken);
      setBody('');
      await qc.invalidateQueries({ queryKey: ['thread', id] });
    } catch (err) {
      setError(problem(err));
    } finally {
      setBusy(false);
    }
  }

  const back = (
    <Button variant="ghost" asChild className="self-start">
      <Link href="/nachrichten">
        <ArrowLeft aria-hidden="true" size={18} />
        {t('back')}
      </Link>
    </Button>
  );
  if (q.isPending)
    return (
      <div className="mx-auto flex max-w-2xl flex-col gap-4 p-4">
        {back}
        <Skeleton className="h-64 w-full" />
      </div>
    );
  if (q.isError || !q.data)
    return (
      <div className="mx-auto flex max-w-2xl flex-col gap-4 p-4">
        {back}
        <Card>
          <EmptyState title={problem(q.error) ?? tc('error')} />
        </Card>
      </div>
    );
  const th = q.data;
  const others = th.participants.filter((p) => p.id !== personId);
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4 p-4">
      {back}
      <div>
        <h1 className="text-h1 break-words">{th.subject}</h1>
        <p className="text-body-sm text-ink-muted">
          {th.aboutStudent ? `${t('about', { name: th.aboutStudent.name })} · ` : ''}
          {th.className ? `${th.className} · ` : ''}
          {t('participants', { names: others.map((p) => p.name).join(', ') })}
        </p>
      </div>
      <ol className="flex flex-col gap-3" aria-label={t('history')}>
        {th.messages.map((m) => (
          <li key={m.id} className={cn('flex', m.own ? 'justify-end' : 'justify-start')}>
            <article
              className={cn(
                'max-w-[85%] rounded-md border px-4 py-2',
                m.own ? 'border-brand bg-bg-raised' : 'border-line bg-bg-sunken',
              )}
            >
              <header className="mb-1 flex flex-wrap items-baseline gap-x-2 text-caption text-ink-muted">
                <span className="font-medium text-ink">{m.own ? t('you') : m.senderName}</span>
                <time dateTime={m.at} className="tabular-nums">
                  {dateTimeOf(m.at)}
                </time>
              </header>
              <p className="whitespace-pre-wrap break-words">{m.body}</p>
            </article>
          </li>
        ))}
      </ol>
      <div ref={end} />
      {th.canReply ? (
        <form onSubmit={send} className="flex flex-col gap-2" noValidate>
          <Textarea
            label={t('reply')}
            value={body}
            maxLength={5000}
            onChange={(e) => setBody(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void send(e);
            }}
          />
          {error ? (
            <p role="alert" className="text-body-sm text-danger-ink">
              {error}
            </p>
          ) : null}
          <Button type="submit" disabled={busy || !body.trim()} className="self-end">
            <Send aria-hidden="true" size={18} />
            {t('send')}
          </Button>
        </form>
      ) : (
        <p className="text-body-sm text-ink-muted">{t('noReply')}</p>
      )}
    </div>
  );
}
