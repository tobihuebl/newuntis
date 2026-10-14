'use client';
import { FilePen } from 'lucide-react';
import Link from 'next/link';
import type { CourseSummary } from '@sp/shared';
import { Card, Chip, EmptyState, Skeleton } from '@sp/ui';
import { useApi } from '../../lib/use-api';
import { useT } from '../../lib/i18n';
import { LoadError } from '../load-error';
import { PageTitle } from '../page-title';
import { courseHref } from './grade-bits';

/** Noten für Lehrkräfte: die eigenen Kurse (Fach in Klasse oder Gruppe) aus dem veröffentlichten Stundenplan. */
export function CoursesScreen() {
  const t = useT('grades');
  const q = useApi<{ data: CourseSummary[] }>(['grades', 'courses'], '/grades/courses');
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 pt-4 pb-8 lg:px-6 lg:pt-6">
      <div className="flex flex-col gap-2">
        <PageTitle area="unterricht">{t('title')}</PageTitle>
        <p className="text-body-sm text-ink-muted">{t('coursesHelp')}</p>
      </div>
      {q.isPending ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2" aria-hidden="true">
          <Skeleton className="h-24 rounded-lg" />
          <Skeleton className="h-24 rounded-lg" />
        </div>
      ) : !q.data ? (
        <LoadError error={q.error} onRetry={() => void q.refetch()} />
      ) : q.data.data.length === 0 ? (
        <Card flat>
          <EmptyState title={t('coursesEmpty')} description={t('coursesEmptyText')} />
        </Card>
      ) : (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {q.data.data.map((c) => (
            <li key={`${c.classId ?? c.groupId}:${c.subjectId}`}>
              <Card interactive asChild className="flex min-h-24 flex-col gap-1">
                <Link href={courseHref(c)}>
                  <span className="text-h3">
                    {c.subject.name} · {c.label}
                  </span>
                  <span className="flex flex-wrap items-center gap-2 text-body-sm text-ink-muted">
                    {t('assessmentsCount', { count: c.assessments })}
                    {c.unreleased ? (
                      <Chip tone="late" icon={FilePen}>
                        {t('unreleasedCount', { count: c.unreleased })}
                      </Chip>
                    ) : null}
                  </span>
                </Link>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
