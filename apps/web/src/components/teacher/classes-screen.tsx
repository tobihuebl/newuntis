'use client';
import { ArrowLeft, CalendarDays, MessageSquare, NotebookPen, UserCheck } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import type { MyClass, MyClassDetail } from '@sp/shared';
import { Chip, Button, Card, EmptyState, Skeleton } from '@sp/ui';
import { useApi, useProblemText } from '../../lib/use-api';

/** Klassen der Lehrkraft (Spec Abschnitt 5, /klassen). */
export function ClassesScreen() {
  const t = useTranslations('classes');
  const tc = useTranslations('common');
  const q = useApi<{ data: MyClass[] }>(['my-classes'], '/my-classes');
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4 p-4">
      <h1 className="text-h1">{t('title')}</h1>
      {q.isPending ? (
        <Skeleton className="h-40 w-full" />
      ) : !q.data ? (
        <Card>
          <EmptyState title={tc('error')} />
        </Card>
      ) : q.data.data.length === 0 ? (
        <Card>
          <EmptyState title={t('empty')} description={t('emptyText')} />
        </Card>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {q.data.data.map((c) => (
            <li key={c.id}>
              <Link
                href={`/klassen/${c.id}`}
                className="flex min-h-24 flex-col gap-1 rounded-md border border-line bg-bg-raised p-4 hover:bg-bg-sunken"
              >
                <span className="flex items-center justify-between gap-2">
                  <span className="text-h3">{c.name}</span>
                  {c.homeroom ? <Chip tone="ok">{t('homeroom')}</Chip> : null}
                </span>
                <span className="text-body-sm text-ink-muted">{t('students', { count: c.students })}</span>
                {c.subjects.length ? (
                  <span className="text-body-sm">{c.subjects.join(', ')}</span>
                ) : null}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Eine Klasse: Schülerliste, Fächer und Lehrkräfte, schnelle Wege zu Plan, Nachricht und Prüfungen. */
export function ClassDetailScreen({ id }: { id: string }) {
  const t = useTranslations('classes');
  const tc = useTranslations('common');
  const problem = useProblemText();
  const q = useApi<MyClassDetail>(['my-classes', id], `/my-classes/${id}`);
  const c = q.data;
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4 p-4">
      <Button variant="ghost" asChild className="self-start">
        <Link href="/klassen">
          <ArrowLeft aria-hidden="true" size={18} />
          {t('back')}
        </Link>
      </Button>
      {q.isPending ? (
        <Skeleton className="h-64 w-full" />
      ) : !c ? (
        <Card>
          <EmptyState title={problem(q.error) ?? tc('error')} />
        </Card>
      ) : (
        <>
          <div>
            <h1 className="text-h1">{t('class', { name: c.name })}</h1>
            <p className="text-body-sm text-ink-muted">
              {c.homeroomTeacher
                ? t('homeroomTeacher', { name: c.homeroomTeacher })
                : t('noHomeroom')}
            </p>
          </div>
          <nav aria-label={t('actions')} className="flex flex-wrap gap-2">
            <Button variant="secondary" asChild>
              <Link href={`/plan?class=${c.id}`}>
                <CalendarDays aria-hidden="true" size={18} />
                {t('plan')}
              </Link>
            </Button>
            <Button variant="secondary" asChild>
              <Link href={`/nachrichten/neu?klasse=${c.id}&zielgruppe=eltern`}>
                <MessageSquare aria-hidden="true" size={18} />
                {t('messageGuardians')}
              </Link>
            </Button>
            <Button variant="secondary" asChild>
              <Link href="/pruefungen">
                <NotebookPen aria-hidden="true" size={18} />
                {t('exams')}
              </Link>
            </Button>
            {c.isHomeroom ? (
              <Button variant="secondary" asChild>
                <Link href={`/klasse/${c.id}/entschuldigungen`}>
                  <UserCheck aria-hidden="true" size={18} />
                  {t('excuses')}
                </Link>
              </Button>
            ) : null}
          </nav>
          <section aria-labelledby="students-h" className="flex flex-col gap-2">
            <h2 id="students-h" className="text-h3">
              {t('studentList', { count: c.students.length })}
            </h2>
            <Card className="p-0">
              <ol>
                {c.students.map((s, i) => (
                  <li
                    key={s.id}
                    className="flex min-h-11 items-center gap-3 border-b border-line px-4 py-2 last:border-b-0"
                  >
                    <span className="w-6 text-right text-body-sm text-ink-muted tabular-nums">{i + 1}</span>
                    <span className="flex-1">{s.name}</span>
                    {!s.hasAccount ? <Chip>{t('noAccount')}</Chip> : null}
                    {s.guardians === 0 ? <Chip tone="late">{t('noGuardian')}</Chip> : null}
                  </li>
                ))}
              </ol>
            </Card>
          </section>
          <section aria-labelledby="subjects-h" className="flex flex-col gap-2">
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
                    <span className="font-medium">{s.name}</span>
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
