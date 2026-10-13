'use client';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { fachColorOf, type ExamItem, type TodayChild, type TodayHomework } from '@sp/shared';
import { Card, EmptyState, FACH_BORDER, SegmentedNav, Skeleton, cn } from '@sp/ui';
import { weekdayDate } from '../../lib/dates';
import { useApi } from '../../lib/use-api';
import { ExamRows } from '../teacher/exams-screen';
import { useT } from '../../lib/i18n';
import { PageTitle } from '../page-title';
import { LoadError } from '../load-error';

/** Schüler:innen "Aufgaben" und Eltern "Termine": Hausübungen und Prüfungen der nächsten Wochen. */
export function TasksScreen({ mode }: { mode: 'student' | 'guardian' }) {
  const t = useT('tasks');
  const children = useApi<{ data: TodayChild[] }>(
    ['children'],
    mode === 'guardian' ? '/me/children' : null,
  );
  const kids = children.data?.data ?? [];
  const chosen = useSearchParams().get('kind') ?? kids[0]?.id ?? null;
  const studentQuery = mode === 'guardian' ? (chosen ? `?studentId=${chosen}` : null) : '';
  const homework = useApi<{ data: TodayHomework[] }>(
    ['homework', chosen ?? 'me'],
    studentQuery === null ? null : `/me/homework${studentQuery}`,
  );
  const exams = useApi<{ data: ExamItem[] }>(
    ['exams', 'view', chosen ?? 'me'],
    studentQuery === null ? null : `/exams${studentQuery}`,
  );
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 pt-4 pb-8 lg:px-6 lg:pt-6">
      <PageTitle area="unterricht">{mode === 'student' ? t('title') : t('termine')}</PageTitle>
      {kids.length > 1 ? (
        <SegmentedNav
          label={t('child')}
          linkAs={Link}
          items={kids.map((k) => ({
            key: k.id,
            href: `/termine?kind=${k.id}`,
            label: k.firstName,
            current: k.id === chosen,
          }))}
        />
      ) : null}
      <section aria-labelledby="hw" className="flex flex-col gap-3">
        <h2 id="hw" className="text-h3">
          {t('homework')}
        </h2>
        {homework.isError ? (
          <LoadError error={homework.error} onRetry={() => void homework.refetch()} />
        ) : !homework.data ? (
          <Skeleton className="h-20 w-full rounded-lg" />
        ) : homework.data.data.length === 0 ? (
          <Card flat>
            <EmptyState as="h3" title={t('noHomework')} />
          </Card>
        ) : (
          <Card className="p-0">
            <ul>
              {homework.data.data.map((h) => (
                <li
                  key={h.occurrenceId}
                  className="flex flex-col gap-0.5 border-b border-line px-4 py-3 last:border-b-0"
                >
                  <p
                    className={cn(
                      'border-l-4 pl-2 text-label',
                      FACH_BORDER[fachColorOf(h.subject)],
                    )}
                  >
                    {h.subject.name} · {t('due', { date: weekdayDate(h.dueOn) })}
                  </p>
                  <p className="text-body whitespace-pre-line">{h.text}</p>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </section>
      <section aria-labelledby="ex" className="flex flex-col gap-3">
        <h2 id="ex" className="text-h3">
          {t('exams')}
        </h2>
        {exams.isError ? (
          <LoadError error={exams.error} onRetry={() => void exams.refetch()} />
        ) : !exams.data ? (
          <Skeleton className="h-20 w-full rounded-lg" />
        ) : exams.data.data.length === 0 ? (
          <Card flat>
            <EmptyState as="h3" title={t('noExams')} />
          </Card>
        ) : (
          <Card className="p-0">
            <ExamRows items={exams.data.data} />
          </Card>
        )}
      </section>
    </div>
  );
}
