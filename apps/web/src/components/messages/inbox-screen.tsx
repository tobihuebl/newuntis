'use client';
import { useInfiniteQuery } from '@tanstack/react-query';
import { Megaphone, PenSquare } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import type { AnnouncementItem, ThreadSummary } from '@sp/shared';
import { Chip, Button, Card, EmptyState, SegmentedControl, Skeleton, cn } from '@sp/ui';
import { apiRequest } from '../../lib/api-client';
import { dateTimeOf } from '../../lib/dates';
import { useApi } from '../../lib/use-api';

interface Page<T> {
  data: T[];
  nextCursor: string | null;
}

function usePaged<T>(key: string[], path: string) {
  return useInfiniteQuery({
    queryKey: key,
    queryFn: ({ pageParam }) =>
      apiRequest<Page<T>>(
        'GET',
        `${path}${path.includes('?') ? '&' : '?'}limit=30${pageParam ? `&cursor=${pageParam}` : ''}`,
      ),
    initialPageParam: '',
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
}

function ListState({
  pending,
  error,
  empty,
  retry,
  emptyTitle,
  emptyText,
  action,
}: {
  pending: boolean;
  error: boolean;
  empty: boolean;
  retry: () => void;
  emptyTitle: string;
  emptyText?: string;
  action?: React.ReactNode;
}) {
  const tc = useTranslations('common');
  if (pending) return <Skeleton className="h-40 w-full" />;
  if (error)
    return (
      <Card>
        <EmptyState
          title={tc('error')}
          action={
            <Button variant="secondary" onClick={retry}>
              {tc('retry')}
            </Button>
          }
        />
      </Card>
    );
  if (empty)
    return (
      <Card>
        <EmptyState title={emptyTitle} description={emptyText} action={action} />
      </Card>
    );
  return null;
}

/** Nachrichten (KO-01) und Rundschreiben (KO-02) in einem Posteingang. */
export function InboxScreen({ canSend, canAnnounce }: { canSend: boolean; canAnnounce: boolean }) {
  const t = useTranslations('messages');
  const search = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const tab = search.get('ansicht') === 'rundschreiben' ? 'announcements' : 'threads';
  const counts = useApi<{ messages: number; announcements: number }>(['inbox'], '/threads/unread');
  const sent = Number(search.get('gesendet') ?? 0);
  const skipped = Number(search.get('ohne') ?? 0);

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-h1">{t('title')}</h1>
        <div className="flex flex-wrap gap-2">
          {canAnnounce ? (
            <Button variant="secondary" asChild>
              <Link href="/rundschreiben">
                <Megaphone aria-hidden="true" size={18} />
                {t('announcementsManage')}
              </Link>
            </Button>
          ) : null}
          {canSend ? (
            <Button asChild>
              <Link href="/nachrichten/neu">
                <PenSquare aria-hidden="true" size={18} />
                {t('new')}
              </Link>
            </Button>
          ) : null}
        </div>
      </div>
      {sent > 0 ? (
        <p role="status" className="rounded-sm border border-brand px-4 py-3 text-body-sm">
          {t('sentMany', { count: sent })}
          {skipped > 0 ? ` ${t('skipped', { count: skipped })}` : ''}
        </p>
      ) : null}
      <SegmentedControl
        label={t('view')}
        value={tab}
        onChange={(v) =>
          router.replace(v === 'announcements' ? `${pathname}?ansicht=rundschreiben` : pathname)
        }
        options={[
          {
            value: 'threads',
            label: counts.data?.messages
              ? t('threadsCount', { count: counts.data.messages })
              : t('threads'),
          },
          {
            value: 'announcements',
            label: counts.data?.announcements
              ? t('announcementsCount', { count: counts.data.announcements })
              : t('announcements'),
          },
        ]}
      />
      {tab === 'threads' ? <ThreadList canSend={canSend} /> : <AnnouncementList />}
    </div>
  );
}

function ThreadList({ canSend }: { canSend: boolean }) {
  const t = useTranslations('messages');
  const tc = useTranslations('common');
  const q = usePaged<ThreadSummary>(['threads'], '/threads');
  const items = q.data?.pages.flatMap((p) => p.data) ?? [];
  const state = (
    <ListState
      pending={q.isPending}
      error={q.isError}
      empty={items.length === 0}
      retry={() => void q.refetch()}
      emptyTitle={t('empty')}
      emptyText={canSend ? t('emptyCanSend') : t('emptyText')}
    />
  );
  if (q.isPending || q.isError || items.length === 0) return state;
  return (
    <>
      <Card className="p-0">
        <ul>
          {items.map((th) => {
            const who = th.aboutStudent
              ? t('about', { name: th.aboutStudent.name })
              : th.participants.map((p) => p.name).join(', ') +
                (th.participantCount > th.participants.length
                  ? ` +${th.participantCount - th.participants.length}`
                  : '');
            return (
              <li key={th.id} className="border-b border-line last:border-b-0">
                <Link
                  href={`/nachrichten/${th.id}`}
                  className={cn(
                    'flex min-h-16 items-start gap-3 px-4 py-3 hover:bg-bg-sunken',
                    th.unread > 0 && 'bg-bg-sunken/60',
                  )}
                >
                  <span
                    aria-hidden="true"
                    className={cn(
                      'mt-2 h-2 w-2 shrink-0 rounded-full',
                      th.unread > 0 ? 'bg-brand' : 'bg-transparent',
                    )}
                  />
                  <span className="min-w-0 flex-1">
                    <span className={cn('block truncate', th.unread > 0 && 'font-semibold')}>
                      {th.subject}
                      {th.unread > 0 ? (
                        <span className="sr-only">, {t('unreadCount', { count: th.unread })}</span>
                      ) : null}
                    </span>
                    <span className="block truncate text-body-sm text-ink-muted">
                      {who}
                      {th.className ? ` · ${th.className}` : ''}
                    </span>
                    {th.lastMessage ? (
                      <span className="block truncate text-body-sm text-ink-muted">
                        {th.lastMessage.own ? t('you') : th.lastMessage.senderName}:{' '}
                        {th.lastMessage.preview}
                      </span>
                    ) : null}
                  </span>
                  <span className="flex shrink-0 flex-col items-end gap-1">
                    {th.lastMessage ? (
                      <span className="text-caption text-ink-muted tabular-nums">
                        {dateTimeOf(th.lastMessage.at)}
                      </span>
                    ) : null}
                    {th.unread > 0 ? (
                      <span
                        aria-hidden="true"
                        className="min-w-5 rounded-full bg-brand px-1.5 text-center text-caption font-semibold leading-5 text-on-brand tabular-nums"
                      >
                        {th.unread}
                      </span>
                    ) : null}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </Card>
      {q.hasNextPage ? (
        <Button variant="secondary" onClick={() => void q.fetchNextPage()} className="self-center">
          {tc('loadMore')}
        </Button>
      ) : null}
    </>
  );
}

function AnnouncementList() {
  const t = useTranslations('messages');
  const tc = useTranslations('common');
  const q = usePaged<AnnouncementItem>(['announcements', 'inbox'], '/announcements');
  const items = q.data?.pages.flatMap((p) => p.data) ?? [];
  if (q.isPending || q.isError || items.length === 0)
    return (
      <ListState
        pending={q.isPending}
        error={q.isError}
        empty={items.length === 0}
        retry={() => void q.refetch()}
        emptyTitle={t('noAnnouncements')}
      />
    );
  return (
    <>
      <Card className="p-0">
        <ul>
          {items.map((a) => (
            <li key={a.id} className="border-b border-line last:border-b-0">
              <Link
                href={`/nachrichten/rundschreiben/${a.id}`}
                className={cn(
                  'flex min-h-16 items-start gap-3 px-4 py-3 hover:bg-bg-sunken',
                  !a.readAt && 'bg-bg-sunken/60',
                )}
              >
                <Megaphone aria-hidden="true" size={18} className="mt-1 shrink-0 text-ink-muted" />
                <span className="min-w-0 flex-1">
                  <span className={cn('block truncate', !a.readAt && 'font-semibold')}>
                    {a.title}
                    {!a.readAt ? <span className="sr-only">, {t('unread')}</span> : null}
                  </span>
                  <span className="block truncate text-body-sm text-ink-muted">{a.author}</span>
                  {a.requiresRead && !a.readAt ? (
                    <Chip tone="late" className="mt-1">
                      {t('confirmPending')}
                    </Chip>
                  ) : null}
                </span>
                <span className="shrink-0 text-caption text-ink-muted tabular-nums">
                  {dateTimeOf(a.publishedAt)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </Card>
      {q.hasNextPage ? (
        <Button variant="secondary" onClick={() => void q.fetchNextPage()} className="self-center">
          {tc('loadMore')}
        </Button>
      ) : null}
    </>
  );
}
