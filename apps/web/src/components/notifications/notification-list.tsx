'use client';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCheck } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { notificationText, type NotificationItem } from '@sp/shared';
import { Button, Card, EmptyState, Skeleton, cn } from '@sp/ui';
import { apiRequest } from '../../lib/api-client';
import { dateTimeOf } from '../../lib/dates';
import { useSession } from '../providers';
import { useT } from '../../lib/i18n';
import { PageTitle } from '../page-title';
import { LoadError } from '../load-error';

interface Page {
  data: NotificationItem[];
  nextCursor: string | null;
  unread: number;
}

export function NotificationList() {
  const t = useT('notifications');
  const tc = useT('common');
  const { csrfToken } = useSession();
  const router = useRouter();
  const qc = useQueryClient();
  const q = useInfiniteQuery({
    queryKey: ['notifications', 'list'],
    queryFn: ({ pageParam }) =>
      apiRequest<Page>('GET', `/notifications?limit=30${pageParam ? `&cursor=${pageParam}` : ''}`),
    initialPageParam: '',
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
  const refresh = () => void qc.invalidateQueries({ queryKey: ['notifications'] });
  const open = async (n: NotificationItem) => {
    if (!n.readAt) await apiRequest('POST', `/notifications/${n.id}/read`, undefined, csrfToken);
    refresh();
    if (n.url) router.push(n.url);
  };
  const items = q.data?.pages.flatMap((p) => p.data) ?? [];
  const unread = q.data?.pages[0]?.unread ?? 0;

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 pt-4 pb-8 lg:px-6 lg:pt-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <PageTitle area="konto">{t('title')}</PageTitle>
        {unread > 0 ? (
          <Button
            variant="secondary"
            size="sm"
            iconLeft={CheckCheck}
            onClick={async () => {
              await apiRequest('POST', '/notifications/read-all', undefined, csrfToken);
              refresh();
            }}
          >
            {t('markAll')}
          </Button>
        ) : null}
      </div>
      {q.isPending ? (
        <Skeleton className="h-40 w-full rounded-lg" />
      ) : q.isError ? (
        <LoadError error={q.error} onRetry={() => void q.refetch()} />
      ) : items.length === 0 ? (
        <Card flat>
          <EmptyState title={t('empty')} description={t('emptyDescription')} />
        </Card>
      ) : (
        <Card className="p-0">
          <ul>
            {items.map((n) => {
              const text = notificationText(n.type, 1, n.params);
              return (
                <li key={n.id} className="border-b border-line last:border-b-0">
                  <button
                    type="button"
                    onClick={() => void open(n)}
                    className="pf-focusable flex min-h-16 w-full items-start gap-3 px-4 py-3 text-left hover:bg-brand-soft"
                  >
                    <span
                      aria-hidden="true"
                      className={cn(
                        'mt-2 size-2 shrink-0 rounded-pill',
                        n.readAt ? 'bg-transparent' : 'bg-signal',
                      )}
                    />
                    <span className="min-w-0 flex-1">
                      <span className={cn('block', n.readAt ? 'text-body' : 'text-body-strong')}>
                        {text.title}
                        {n.params.correction ? ` (${t('correction')})` : ''}
                        {!n.readAt ? <span className="sr-only">, {t('unread')}</span> : null}
                      </span>
                      <span className="block text-body-sm text-ink-muted">{text.body}</span>
                    </span>
                    <span className="shrink-0 text-mono-sm text-ink-muted">
                      {dateTimeOf(n.createdAt)}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </Card>
      )}
      {q.hasNextPage ? (
        <Button variant="secondary" onClick={() => void q.fetchNextPage()} className="self-center">
          {tc('loadMore')}
        </Button>
      ) : null}
    </div>
  );
}
