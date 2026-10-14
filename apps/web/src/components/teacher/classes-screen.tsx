'use client';
import {
  ArrowLeft,
  Award,
  CalendarDays,
  KeyRound,
  MessageSquare,
  NotebookPen,
  Pencil,
  TriangleAlert,
  UserCheck,
} from 'lucide-react';
import Link from 'next/link';
import type { MyClass, MyClassDetail, TodayStatus } from '@sp/shared';
import { Chip, Button, Card, EmptyState, Skeleton, cn } from '@sp/ui';
import { weekdayDate } from '../../lib/dates';
import { ClassTabs } from '../absences/class-absences';
import { TransitionCard } from '../transition/transition-card';
import { useApi } from '../../lib/use-api';
import { useT } from '../../lib/i18n';
import { PageTitle } from '../page-title';
import { LoadError } from '../load-error';

/** Klassen der Lehrkraft (Spec Abschnitt 5, /klassen). */
export function ClassesScreen() {
  const t = useT('classes');
  const q = useApi<{ data: MyClass[] }>(['my-classes'], '/my-classes');
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 pt-4 pb-8 lg:px-6 lg:pt-6">
      <PageTitle area="unterricht">{t('title')}</PageTitle>
      {q.isPending ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2" aria-hidden="true">
          <Skeleton className="h-28 rounded-lg" />
          <Skeleton className="h-28 rounded-lg" />
        </div>
      ) : !q.data ? (
        <LoadError error={q.error} onRetry={() => void q.refetch()} />
      ) : q.data.data.length === 0 ? (
        <Card flat>
          <EmptyState title={t('empty')} description={t('emptyText')} />
        </Card>
      ) : (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {q.data.data.map((c) => (
            <li key={c.id}>
              <Card interactive asChild className="flex min-h-28 flex-col gap-1">
                <Link href={`/klassen/${c.id}`}>
                  <span className="flex items-center justify-between gap-2">
                    <span className="text-h3">{c.name}</span>
                    {c.homeroom ? (
                      <Chip tone="ok" icon={UserCheck}>
                        {t('homeroom')}
                      </Chip>
                    ) : null}
                  </span>
                  <span className="text-body-sm text-ink-muted">
                    {t('students', { count: c.students })}
                  </span>
                  {c.subjects.length ? (
                    <span className="text-body-sm">{c.subjects.join(', ')}</span>
                  ) : null}
                </Link>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

type Student = MyClassDetail['students'][number];

const STATUS_TONE: Record<TodayStatus, 'ok' | 'late' | 'danger' | 'absent' | null> = {
  present: 'ok',
  late: 'late',
  absent: 'danger',
  reported: 'absent',
  open: null,
};

/**
 * Eine Klasse für alle Rollen: zuerst "Heute" (wer ist da, wer nicht), dann die Schülerliste mit dem Stand von
 * heute, Fächer und Lehrkräfte. Klassenvorstand, Direktion und Administration sehen die Reiter der Klasse.
 */
export function ClassDetailScreen({ id }: { id: string }) {
  const t = useT('classes');
  const q = useApi<MyClassDetail>(['my-classes', id], `/my-classes/${id}`);
  const c = q.data;
  const label = (s: Student) =>
    s.today === 'late' && s.lateMinutes
      ? t('status_lateMinutes', { minutes: s.lateMinutes })
      : t(`status_${s.today}`);
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 pt-4 pb-8 lg:px-6 lg:pt-6">
      <Button variant="ghost" size="sm" asChild iconLeft={ArrowLeft} className="self-start">
        <Link href="/klassen">{t('back')}</Link>
      </Button>
      {q.isPending ? (
        <Skeleton className="h-64 w-full rounded-lg" />
      ) : !c ? (
        <LoadError error={q.error} onRetry={() => void q.refetch()} />
      ) : (
        <>
          <div className="flex flex-col gap-2">
            <PageTitle area="unterricht">{t('class', { name: c.name })}</PageTitle>
            <p className="text-body-sm text-ink-muted">
              {c.homeroomTeacher
                ? t('homeroomTeacher', { name: c.homeroomTeacher })
                : t('noHomeroom')}
            </p>
          </div>
          {c.canReview ? (
            <ClassTabs classId={c.id} tab="uebersicht" remarks={c.canSeeRemarks} />
          ) : null}
          <nav aria-label={t('actions')} className="flex flex-wrap gap-2">
            <Button variant="secondary" size="sm" asChild iconLeft={CalendarDays}>
              <Link href={`/plan?class=${c.id}`}>{t('plan')}</Link>
            </Button>
            <Button variant="secondary" size="sm" asChild iconLeft={MessageSquare}>
              <Link href={`/nachrichten/neu?klasse=${c.id}&zielgruppe=eltern`}>
                {t('messageGuardians')}
              </Link>
            </Button>
            <Button variant="secondary" size="sm" asChild iconLeft={NotebookPen}>
              <Link href="/pruefungen">{t('exams')}</Link>
            </Button>
            {c.canReview ? (
              <Button variant="secondary" size="sm" asChild iconLeft={Award}>
                <Link href={`/noten/klasse/${c.id}`}>{t('grades')}</Link>
              </Button>
            ) : null}
            {c.canIssueAccess ? (
              <Button variant="secondary" size="sm" asChild iconLeft={KeyRound}>
                <Link href={`/klasse/${c.id}/zugang`}>{t('access')}</Link>
              </Button>
            ) : null}
            {c.canEdit ? (
              <Button variant="ghost" size="sm" asChild iconLeft={Pencil}>
                <Link href={`/admin/klassen/${c.id}`}>{t('edit')}</Link>
              </Button>
            ) : null}
          </nav>

          <TodayCard c={c} label={label} />
          {c.canReview ? <TransitionCard classId={c.id} /> : null}

          <section aria-labelledby="students-h" className="flex flex-col gap-3">
            <h2 id="students-h" className="text-h3">
              {t('studentList', { count: c.students.length })}
            </h2>
            <Card className="p-0">
              <ol>
                {c.students.map((s, i) => {
                  const tone = STATUS_TONE[s.today];
                  return (
                    <li
                      key={s.id}
                      className="flex min-h-13 flex-wrap items-center gap-3 border-b border-line px-4 py-2 last:border-b-0"
                    >
                      <span className="w-6 text-right text-mono-sm text-ink-muted">{i + 1}</span>
                      <span className="flex-1 text-body">{s.name}</span>
                      {c.canReview && s.guardians === 0 ? (
                        <Chip tone="late" icon={TriangleAlert}>
                          {t('noGuardian')}
                        </Chip>
                      ) : null}
                      {tone ? (
                        <Chip tone={tone}>{label(s)}</Chip>
                      ) : (
                        <span className="text-caption text-ink-muted">{label(s)}</span>
                      )}
                    </li>
                  );
                })}
              </ol>
            </Card>
          </section>
          <section aria-labelledby="subjects-h" className="flex flex-col gap-3">
            <h2 id="subjects-h" className="text-h3">
              {t('subjects')}
            </h2>
            <Card className="p-0">
              <ul>
                {c.subjects.map((s) => (
                  <li
                    key={s.name}
                    className="flex min-h-11 flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-2 last:border-b-0"
                  >
                    <span className="text-body-strong">{s.name}</span>
                    <span className="text-body-sm text-ink-muted">{s.teachers.join(', ')}</span>
                  </li>
                ))}
              </ul>
            </Card>
          </section>
        </>
      )}
    </div>
  );
}

/** Heute auf einen Blick: Zahlen und die Namen derer, die fehlen oder zu spät sind. */
function TodayCard({ c, label }: { c: MyClassDetail; label: (s: Student) => string }) {
  const t = useT('classes');
  const count = (...st: TodayStatus[]) => c.students.filter((s) => st.includes(s.today)).length;
  const away = c.students.filter((s) => s.today === 'absent' || s.today === 'reported');
  const late = c.students.filter((s) => s.today === 'late');
  return (
    <section aria-labelledby="today-h">
      <Card className="flex flex-col gap-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="today-h" className="text-h3">
            {t('today')}
          </h2>
          <span className="text-body-sm text-ink-muted">{weekdayDate(c.today.date)}</span>
        </div>
        {c.today.lessonsTotal === 0 ? (
          <p className="text-body-sm text-ink-muted">{t('todayNoLessons')}</p>
        ) : (
          <>
            <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {(
                [
                  ['present', count('present', 'late'), 'text-brand-text'],
                  ['away', away.length, away.length ? 'text-danger-ink' : 'text-ink'],
                  ['late', late.length, 'text-ink'],
                  ['open', count('open'), 'text-ink-muted'],
                ] as const
              ).map(([k, n, color]) => (
                <div key={k} className="flex flex-col rounded-md bg-bg-sunken px-3 py-2">
                  <dt className="text-caption text-ink-muted">{t(`count_${k}`)}</dt>
                  <dd className={cn('text-h2', color)}>{n}</dd>
                </div>
              ))}
            </dl>
            {c.today.lessonsStarted === 0 ? (
              <p className="text-body-sm text-ink-muted">{t('todayNotStarted')}</p>
            ) : null}
            {away.length || late.length ? (
              <ul className="flex flex-col gap-2" aria-label={t('todayList')}>
                {[...away, ...late].map((s) => (
                  <li key={s.id} className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-body-strong">{s.name}</span>
                    <Chip tone={STATUS_TONE[s.today] ?? 'absent'}>{label(s)}</Chip>
                  </li>
                ))}
              </ul>
            ) : c.today.lessonsStarted > 0 && count('open') === 0 ? (
              <p className="text-body-sm">{t('todayAllHere')}</p>
            ) : null}
          </>
        )}
      </Card>
    </section>
  );
}
