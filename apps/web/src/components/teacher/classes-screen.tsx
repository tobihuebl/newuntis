'use client';
import {
  ArrowLeft,
  CalendarDays,
  MessageSquare,
  NotebookPen,
  TriangleAlert,
  UserCheck,
  UserX,
} from 'lucide-react';
import Link from 'next/link';
import type { MyClass, MyClassDetail } from '@sp/shared';
import { Chip, Button, Card, EmptyState, Skeleton } from '@sp/ui';
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
        <div className="grid gap-3 sm:grid-cols-2" aria-hidden="true">
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
        <ul className="grid gap-3 sm:grid-cols-2">
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

/** Eine Klasse: Schülerliste, Fächer und Lehrkräfte, schnelle Wege zu Plan, Nachricht und Prüfungen. */
export function ClassDetailScreen({ id }: { id: string }) {
  const t = useT('classes');
  const q = useApi<MyClassDetail>(['my-classes', id], `/my-classes/${id}`);
  const c = q.data;
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
          <nav aria-label={t('actions')} className="flex flex-wrap gap-2">
            <Button variant="secondary" size="sm" asChild iconLeft={CalendarDays}>
              <Link href={`/plan?class=${c.id}`}>{t('plan')}</Link>
            </Button>
            <Button variant="secondary" size="sm" asChild iconLeft={MessageSquare}>
              <Link href={`/nachrichten/neu?klasse=${c.id}&zielgruppe=eltern`}>{t('messageGuardians')}</Link>
            </Button>
            <Button variant="secondary" size="sm" asChild iconLeft={NotebookPen}>
              <Link href="/pruefungen">{t('exams')}</Link>
            </Button>
            {c.isHomeroom ? (
              <Button variant="secondary" size="sm" asChild iconLeft={UserCheck}>
                <Link href={`/klasse/${c.id}/entschuldigungen`}>{t('excuses')}</Link>
              </Button>
            ) : null}
          </nav>
          <section aria-labelledby="students-h" className="flex flex-col gap-3">
            <h2 id="students-h" className="text-h3">
              {t('studentList', { count: c.students.length })}
            </h2>
            <Card className="p-0">
              <ol>
                {c.students.map((s, i) => (
                  <li
                    key={s.id}
                    className="flex min-h-13 flex-wrap items-center gap-3 border-b border-line px-4 py-2 last:border-b-0"
                  >
                    <span className="w-6 text-right text-mono-sm text-ink-muted">
                      {i + 1}
                    </span>
                    <span className="flex-1 text-body">{s.name}</span>
                    {!s.hasAccount ? (
                      <Chip tone="absent" icon={UserX}>
                        {t('noAccount')}
                      </Chip>
                    ) : null}
                    {s.guardians === 0 ? (
                      <Chip tone="late" icon={TriangleAlert}>
                        {t('noGuardian')}
                      </Chip>
                    ) : null}
                  </li>
                ))}
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
