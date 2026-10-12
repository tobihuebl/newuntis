'use client';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { notificationText, type NotificationItem } from '@sp/shared';
import { Button, Card, EmptyState, Skeleton, cn } from '@sp/ui';
import { apiRequest } from '../../lib/api-client';
import { dateTimeOf } from '../../lib/dates';
import { useSession } from '../providers';

interface Page {
  data: NotificationItem[];
  nextCursor: string | null;
  unread: number;
}

export function NotificationList() {
  const t = useTranslations('notifications');
  const tc = useTranslations('common');
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
    <div className="mx-auto flex max-w-2xl flex-col gap-4 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-h1">{t('title')}</h1>
        {unread > 0 ? (
          <Button
            variant="secondary"
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
        <Skeleton className="h-40 w-full" />
      ) : q.isError ? (
        <Card>
          <EmptyState
            title={tc('error')}
            action={
              <Button variant="secondary" onClick={() => void q.refetch()}>
                {tc('retry')}
              </Button>
            }
          />
        </Card>
      ) : items.length === 0 ? (
        <Card>
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
                    className={cn(
                      'flex min-h-16 w-full items-start gap-3 px-4 py-3 text-left hover:bg-bg-sunken',
                      !n.readAt && 'bg-bg-sunken/60',
                    )}
                  >
                    <span
                      aria-hidden="true"
                      className={cn(
                        'mt-2 h-2 w-2 shrink-0 rounded-full',
                        n.readAt ? 'bg-transparent' : 'bg-brand',
                      )}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block font-medium">
                        {text.title}
                        {n.params.correction ? ` (${t('correction')})` : ''}
                        {!n.readAt ? <span className="sr-only">, {t('unread')}</span> : null}
                      </span>
                      <span className="block text-body-sm text-ink-muted">{text.body}</span>
                    </span>
                    <span className="shrink-0 text-caption text-ink-muted tabular-nums">
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
