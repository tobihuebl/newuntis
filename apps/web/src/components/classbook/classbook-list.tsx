'use client';
import type { OpenEntry, TodayResponse } from '@sp/shared';
import { Chip, Card, EmptyState } from '@sp/ui';
import { weekdayDate } from '../../lib/dates';
import { useCached, useOutbox } from '../../offline/hooks';
import { SyncStatus } from '../sync-status';
import { LessonRow } from '../today/lesson-row';
import { LoadError, TodaySkeleton, previousEnds } from '../today/today-screen';
import { useT } from '../../lib/i18n';
import { PageTitle } from '../page-title';

/** Tab "Klassenbuch" der Lehrkräfte: offene Einträge (KB-04) und die Stunden von heute. */
export function ClassbookList() {
  const t = useT('classbook');
  const tt = useT('today');
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
      <Chip tone="ok">{tt('progress_pending')}</Chip>
    ) : (
      <Chip tone={p === 'closed' ? 'ok' : p === 'started' ? 'late' : 'neutral'}>
        {tt(`progress_${p}`)}
      </Chip>
    );

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 pt-4 pb-8 lg:px-6 lg:pt-6">
      <PageTitle area="unterricht">{t('title')}</PageTitle>
      <SyncStatus />
      <section aria-labelledby="open" className="flex flex-col gap-2">
        <h2 id="open" className="text-h3">
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
                      <span className="text-caption text-ink-muted">{weekdayDate(o.date)}</span>
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
        <h2 id="today" className="text-h3">
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
