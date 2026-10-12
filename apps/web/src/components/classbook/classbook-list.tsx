'use client';
import { useTranslations } from 'next-intl';
import type { OpenEntry, TodayResponse } from '@sp/shared';
import { Badge, Card, EmptyState } from '@sp/ui';
import { weekdayDate } from '../../lib/dates';
import { useCached, useOutbox } from '../../offline/hooks';
import { SyncStatus } from '../sync-status';
import { LessonRow } from '../today/lesson-row';
import { LoadError, TodaySkeleton, previousEnds } from '../today/today-screen';

/** Tab "Klassenbuch" der Lehrkräfte: offene Einträge (KB-04) und die Stunden von heute. */
export function ClassbookList() {
  const t = useTranslations('classbook');
  const tt = useTranslations('today');
  const open = useCached<{ data: OpenEntry[] }>(
    ['classbook', 'open'],
    'classbook:open',
    '/classbook/open',
  );
  const today = useCached<TodayResponse>(['today', 'me'], 'today:me', '/today');
  const closing = new Set(
    useOutbox()
      .filter((o) => o.kind === 'close')
      .map((o) => o.occurrenceId),
  );
  const openList = (open.data?.data.data ?? []).filter((o) => !closing.has(o.id));
  const progress = (p: 'none' | 'started' | 'closed' | null, id: string) =>
    p === null ? null : closing.has(id) && p !== 'closed' ? (
      <Badge tone="info">{tt('progress_pending')}</Badge>
    ) : (
      <Badge tone={p === 'closed' ? 'success' : p === 'started' ? 'warning' : 'neutral'}>
        {tt(`progress_${p}`)}
      </Badge>
    );

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4 p-4">
      <h1 className="text-2xl font-semibold">{t('title')}</h1>
      <SyncStatus />
      <section aria-labelledby="open" className="flex flex-col gap-2">
        <h2 id="open" className="text-lg font-semibold">
          {t('open')}
        </h2>
        {open.isPending ? (
          <TodaySkeleton />
        ) : open.isError ? (
          <LoadError error={open.error} onRetry={() => void open.refetch()} />
        ) : openList.length === 0 ? (
          <Card>
            <EmptyState title={t('openEmpty')} description={t('openEmptyDescription')} />
          </Card>
        ) : (
          <Card className="p-0">
            <ul>
              {openList.map((o) => (
                <LessonRow
                  key={o.id}
                  entry={o}
                  perspective="teacher"
                  href={`/klassenbuch/${o.id}?von=liste`}
                  trailing={
                    <>
                      <span className="text-xs text-muted">{weekdayDate(o.date)}</span>
                      {progress(o.classbook, o.id)}
                    </>
                  }
                />
              ))}
            </ul>
          </Card>
        )}
      </section>
      <section aria-labelledby="today" className="flex flex-col gap-2">
        <h2 id="today" className="text-lg font-semibold">
          {t('todayList')}
        </h2>
        {today.isPending ? (
          <TodaySkeleton />
        ) : today.isError ? (
          <LoadError error={today.error} onRetry={() => void today.refetch()} />
        ) : today.data.data.lessons.length === 0 ? (
          <Card>
            <EmptyState title={tt('emptyTitle')} />
          </Card>
        ) : (
          <Card className="p-0">
            <ul>
              {today.data.data.lessons.map((l, i, all) => (
                <LessonRow
                  timeline={{ previousEndsAt: previousEnds(all)[i] ?? null }}
                  key={l.id}
                  entry={l}
                  perspective="teacher"
                  href={
                    l.status === 'CANCELLED' || l.planned
                      ? undefined
                      : `/klassenbuch/${l.id}?von=liste`
                  }
                  trailing={progress(l.classbook, l.id)}
                />
              ))}
            </ul>
          </Card>
        )}
      </section>
    </div>
  );
}
