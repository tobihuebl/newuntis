'use client';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import type { ClassGradesOverview, SemesterNo } from '@sp/shared';
import { Button, Card, EmptyState, Skeleton } from '@sp/ui';
import { useApi } from '../../lib/use-api';
import { useT } from '../../lib/i18n';
import { LoadError } from '../load-error';
import { PageTitle } from '../page-title';
import { courseHref, formatAverage, semesterParam, SemesterSwitch } from './grade-bits';

/**
 * Notenübersicht einer Klasse (Klassenvorstand, Direktion, Administration): gewichteter Durchschnitt je
 * Schüler:in und Fach; die Fachspalte führt zu den Leistungen des Fachs (nur lesen).
 */
export function ClassGradesScreen({ classId }: { classId: string }) {
  const t = useT('grades');
  const [semester, setSemester] = useState<SemesterNo | null>(null);
  const q = useApi<ClassGradesOverview>(
    ['grades', 'class', classId, semester ?? 'year'],
    `/grades/classes/${classId}${semesterParam(semester, '?')}`,
  );
  const d = q.data;
  return (
    <div className="mx-auto flex w-full max-w-(--content-max) flex-col gap-6 px-4 pt-4 pb-8 lg:px-6 lg:pt-6">
      <Button variant="ghost" size="sm" asChild iconLeft={ArrowLeft} className="self-start">
        <Link href={`/klassen/${classId}`}>{t('backToClass')}</Link>
      </Button>
      {q.isPending ? (
        <Skeleton className="h-64 w-full rounded-lg" />
      ) : !d ? (
        <LoadError error={q.error} onRetry={() => void q.refetch()} />
      ) : (
        <>
          <div className="flex flex-col gap-2">
            <PageTitle area="noten">{t('classTitle', { name: d.className })}</PageTitle>
            <p className="text-body-sm text-ink-muted">{t('classHelp')}</p>
          </div>
          <SemesterSwitch semesters={d.semesters} value={semester} onChange={setSemester} />
          {d.subjects.length === 0 ? (
            <Card flat>
              <EmptyState title={t('classEmpty')} />
            </Card>
          ) : (
            <Card className="overflow-x-auto p-0">
              <table className="w-full text-body-sm">
                <thead>
                  <tr className="text-left text-label text-ink-muted">
                    <th scope="col" className="sticky left-0 bg-bg-raised px-4 py-2">
                      {t('student')}
                    </th>
                    {d.subjects.map((s) => (
                      <th key={s.id} scope="col" className="px-2 py-2 text-center">
                        <Link
                          href={courseHref({ classId: d.classId, groupId: null, subjectId: s.id })}
                          className="pf-focusable text-brand-text underline underline-offset-4"
                        >
                          <abbr title={s.name} className="no-underline">
                            {s.code}
                          </abbr>
                        </Link>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {d.students.map((st) => (
                    <tr key={st.id} className="border-t border-line">
                      <th
                        scope="row"
                        className="sticky left-0 bg-bg-raised px-4 py-2 text-left text-body-sm whitespace-nowrap"
                      >
                        {st.name}
                      </th>
                      {d.subjects.map((s) => {
                        const v = st.averages[s.id];
                        return (
                          <td
                            key={s.id}
                            className={
                              v !== null && v !== undefined && v > 4.5
                                ? 'px-2 py-2 text-center text-mono text-danger-ink'
                                : 'px-2 py-2 text-center text-mono'
                            }
                          >
                            {formatAverage(v)}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          )}
          <p className="text-caption text-ink-muted">{t('averageHint')}</p>
        </>
      )}
    </div>
  );
}
