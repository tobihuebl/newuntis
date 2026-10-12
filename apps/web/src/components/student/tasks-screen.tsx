'use client';
import { useRouter, useSearchParams } from 'next/navigation';
import { fachColorOf, type ExamItem, type TodayChild, type TodayHomework } from '@sp/shared';
import { Button, Card, EmptyState, FACH_BORDER, Skeleton, cn } from '@sp/ui';
import { weekdayDate } from '../../lib/dates';
import { useApi } from '../../lib/use-api';
import { ExamRows } from '../teacher/exams-screen';
import { useT } from '../../lib/i18n';
import { PageTitle } from '../page-title';

/** Schüler:innen "Aufgaben" und Eltern "Termine": Hausübungen und Prüfungen der nächsten Wochen. */
export function TasksScreen({ mode }: { mode: 'student' | 'guardian' }) {
  const t = useT('tasks');
  const router = useRouter();
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
        <nav className="flex flex-wrap gap-2" aria-label={t('termine')}>
          {kids.map((k) => (
            <Button
              key={k.id}
              variant={k.id === chosen ? 'primary' : 'secondary'}
              aria-current={k.id === chosen ? 'page' : undefined}
              onClick={() => router.replace(`/termine?kind=${k.id}`)}
            >
              {k.firstName}
            </Button>
          ))}
        </nav>
      ) : null}
      <section aria-labelledby="hw" className="flex flex-col gap-2">
        <h2 id="hw" className="text-h3">
          {t('homework')}
        </h2>
        {!homework.data ? (
          <Skeleton className="h-20 w-full" />
        ) : homework.data.data.length === 0 ? (
          <Card>
            <EmptyState title={t('noHomework')} />
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
                  <p className="whitespace-pre-line">{h.text}</p>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </section>
      <section aria-labelledby="ex" className="flex flex-col gap-2">
        <h2 id="ex" className="text-h3">
          {t('exams')}
        </h2>
        {!exams.data ? (
          <Skeleton className="h-20 w-full" />
        ) : exams.data.data.length === 0 ? (
          <Card>
            <EmptyState title={t('noExams')} />
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
