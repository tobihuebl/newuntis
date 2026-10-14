'use client';
import { ChevronDown } from 'lucide-react';
import { fachColorOf, type StudentGrades } from '@sp/shared';
import { Card, EmptyState, FACH_BG, Skeleton, cn } from '@sp/ui';
import { shortDate } from '../../lib/dates';
import { useApi } from '../../lib/use-api';
import { useT } from '../../lib/i18n';
import { LoadError } from '../load-error';
import { formatAverage, GradeSpread, WeightsLine } from './grade-bits';

/**
 * Eigene Noten (Schüler:in) oder die eines Kindes (Eltern): je Fach der gewichtete Durchschnitt und die
 * freigegebenen Leistungen; der Notenspiegel der Klasse lässt sich je Leistung aufklappen.
 */
export function MyGrades({ studentId }: { studentId?: string }) {
  const t = useT('grades');
  const q = useApi<StudentGrades>(
    ['grades', 'me', studentId ?? 'self'],
    `/me/grades${studentId ? `?studentId=${studentId}` : ''}`,
  );
  if (q.isPending) return <Skeleton className="h-48 w-full rounded-lg" />;
  if (!q.data) return <LoadError error={q.error} onRetry={() => void q.refetch()} />;
  if (q.data.subjects.length === 0)
    return (
      <Card flat>
        <EmptyState title={t('mineEmpty')} description={t('mineEmptyText')} />
      </Card>
    );
  return (
    <ul className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      {q.data.subjects.map((s) => (
        <li key={s.subject.id}>
          <Card className="flex flex-col gap-3">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <span
                  aria-hidden="true"
                  className={cn('h-8 w-1.5 shrink-0 rounded-pill', FACH_BG[fachColorOf(s.subject)])}
                />
                <h2 className="text-h3">{s.subject.name}</h2>
              </div>
              <span className="flex flex-col items-end">
                <span className="text-h2">{formatAverage(s.average)}</span>
                <span className="text-caption text-ink-muted">{t('average')}</span>
              </span>
            </div>
            <ul className="flex flex-col divide-y divide-line">
              {s.assessments.map((a) => (
                <li key={a.id} className="py-2">
                  <details className="group">
                    <summary className="pf-focusable flex min-h-11 cursor-pointer list-none items-center gap-3">
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="text-body-strong">{a.title}</span>
                        <span className="text-caption text-ink-muted">
                          {t(`kind_${a.kind}`)} · {shortDate(a.date)}
                        </span>
                      </span>
                      <span className="text-mono text-body-strong">
                        {a.value === null ? '–' : `${a.value} · ${t(`grade_${a.value}`)}`}
                      </span>
                      <ChevronDown
                        aria-hidden="true"
                        className="size-4 text-ink-muted transition-transform group-open:rotate-180"
                      />
                    </summary>
                    <div className="flex flex-col gap-2 pt-2">
                      {a.comment ? <p className="text-body-sm">{a.comment}</p> : null}
                      <p className="text-caption text-ink-muted">{t('spreadClass')}</p>
                      <GradeSpread distribution={a.distribution} className="max-w-xs" />
                    </div>
                  </details>
                </li>
              ))}
            </ul>
            {/* Gewichtung nur, wo sie etwas ändert: mehrere Notenarten im Fach */}
            {new Set(s.assessments.map((a) => a.kind)).size > 1 ? (
              <p className="text-caption text-ink-muted">
                {t('weighting')}: <WeightsLine weights={s.weights} />
              </p>
            ) : null}
          </Card>
        </li>
      ))}
    </ul>
  );
}
