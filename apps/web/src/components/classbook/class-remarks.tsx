'use client';
import { NotebookPen } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import type { ClassRemarkItem } from '@sp/shared';
import { Card, EmptyState, Select, Skeleton } from '@sp/ui';
import { dateTimeOf, weekdayDate } from '../../lib/dates';
import { useT } from '../../lib/i18n';
import { useApi } from '../../lib/use-api';
import { ClassTabs } from '../absences/class-absences';
import { LoadError } from '../load-error';
import { PageTitle } from '../page-title';

/** Vermerke der Klasse (KB-07) für Klassenvorstand und Direktion: neueste zuerst, filterbar nach Schüler:in. */
export function ClassRemarks({ classId, className }: { classId: string; className: string }) {
  const t = useT('klasse');
  const q = useApi<{ data: ClassRemarkItem[] }>(
    ['remarks', 'class', classId],
    `/my-classes/${classId}/remarks`,
  );
  const [student, setStudent] = useState('');
  const all = q.data?.data ?? [];
  const students = [...new Map(all.map((r) => [r.studentId, r.student])).entries()].sort((a, b) =>
    a[1].localeCompare(b[1], 'de'),
  );
  const shown = student ? all.filter((r) => r.studentId === student) : all;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 pt-4 pb-8 lg:px-6 lg:pt-6">
      <PageTitle area="klassenvorstand">{className}</PageTitle>
      <ClassTabs classId={classId} tab="vermerke" remarks />
      <p className="text-body-sm text-ink-muted">{t('remarksHelp')}</p>
      {q.isError ? (
        <LoadError error={q.error} onRetry={() => void q.refetch()} />
      ) : q.isPending ? (
        <Skeleton className="h-32 w-full rounded-lg" />
      ) : all.length === 0 ? (
        <Card flat>
          <EmptyState as="h2" title={t('remarksEmpty')} />
        </Card>
      ) : (
        <>
          <Select
            label={t('remarksFilter')}
            value={student}
            onChange={(e) => setStudent(e.target.value)}
            emptyLabel={t('remarksAll', { count: all.length })}
            options={students.map(([id, name]) => ({ value: id, label: name }))}
            fieldClassName="max-w-xs"
          />
          <Card className="p-0">
            <ul aria-label={t('remarks')} className="flex flex-col divide-y divide-line">
              {shown.map((r) => (
                <li key={r.id} className="flex items-start gap-3 px-4 py-3">
                  <NotebookPen
                    aria-hidden="true"
                    className="mt-0.5 size-4 shrink-0 text-ink-muted"
                  />
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <p className="flex flex-wrap items-baseline justify-between gap-x-3">
                      <span className="text-label">{r.student}</span>
                      <Link
                        href={`/klassenbuch/${r.occurrenceId}`}
                        className="pf-focusable text-mono-sm text-brand-text underline underline-offset-4"
                      >
                        {weekdayDate(r.date)} · {r.subject}
                      </Link>
                    </p>
                    <p className="text-body-sm whitespace-pre-line">{r.text}</p>
                    <p className="text-caption text-ink-muted">
                      {r.author} · {dateTimeOf(r.createdAt)}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        </>
      )}
    </div>
  );
}
