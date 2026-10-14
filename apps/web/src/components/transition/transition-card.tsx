'use client';
import { CalendarClock, Check, X } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import type { PromotionSummary } from '@sp/shared';
import { Button, Card, Chip, Sheet, useToast } from '@sp/ui';
import { useApi, useApiMutation, useProblemText } from '../../lib/use-api';
import { useT } from '../../lib/i18n';
import { FormError } from '../form-bits';

/**
 * Schuljahreswechsel auf der Klassenseite (KV, Direktion, Administration): sobald das nächste Schuljahr angelegt
 * ist, der Stand der Entscheidungen; im neuen Schuljahr die offenen Wiederholungsprüfungen mit Ergebnis.
 */
export function TransitionCard({ classId }: { classId: string }) {
  const t = useT('transition');
  const tc = useT('common');
  const problem = useProblemText();
  const toast = useToast();
  const key = ['promotions', 'summary', classId];
  const q = useApi<PromotionSummary>(key, `/promotions/summary?classId=${classId}`);
  const [failed, setFailed] = useState<{
    studentId: string;
    name: string;
    fromClass: string;
  } | null>(null);
  const exam = useApiMutation<
    { studentId: string; passed: boolean },
    { movedTo: { name: string } | null }
  >('POST', () => '/promotions/exam', [key, ['my-classes', classId]]);
  const s = q.data;
  if (!s || (!s.nextYear && s.pendingExams.length === 0)) return null;
  const total = Object.values(s.counts).reduce((a, b) => a + b, 0);

  return (
    <>
      {s.pendingExams.length ? (
        <section aria-labelledby="exams-h">
          <Card className="flex flex-col gap-3">
            <h2 id="exams-h" className="text-h3">
              {t('examsTitle', { count: s.pendingExams.length })}
            </h2>
            <p className="text-body-sm text-ink-muted">{t('examsHelp')}</p>
            <ul className="flex flex-col divide-y divide-line">
              {s.pendingExams.map((p) => (
                <li key={p.studentId} className="flex flex-wrap items-center gap-2 py-2">
                  <span className="flex-1 text-body-strong">
                    {p.name}{' '}
                    <span className="text-body-sm text-ink-muted">
                      {t('fromClass', { name: p.fromClass })}
                    </span>
                  </span>
                  <Button
                    size="sm"
                    variant="secondary"
                    iconLeft={Check}
                    loading={exam.isPending && exam.variables?.studentId === p.studentId}
                    onClick={() =>
                      exam.mutate(
                        { studentId: p.studentId, passed: true },
                        { onSuccess: () => toast({ text: t('passedToast', { name: p.name }) }) },
                      )
                    }
                  >
                    {t('passed')}
                  </Button>
                  <Button size="sm" variant="ghost" iconLeft={X} onClick={() => setFailed(p)}>
                    {t('failed')}
                  </Button>
                </li>
              ))}
            </ul>
            {exam.error && !failed ? (
              <FormError message={problem(exam.error) ?? tc('error')} />
            ) : null}
          </Card>
        </section>
      ) : null}

      {s.nextYear ? (
        <section aria-labelledby="transition-h">
          <Card className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 id="transition-h" className="flex items-center gap-2 text-h3">
                <CalendarClock aria-hidden="true" className="size-5 text-brand-text" />
                {t('cardTitle')}
              </h2>
              <Button size="sm" asChild>
                <Link href={`/klasse/${classId}/aufstieg`}>{t('cardAction')}</Link>
              </Button>
            </div>
            <p className="text-body-sm text-ink-muted">
              {t('cardHelp', { year: s.nextYear.name })}
            </p>
            {total ? (
              <p className="flex flex-wrap gap-2">
                <Chip tone="ok">{t('count_PROMOTE', { count: s.counts.PROMOTE })}</Chip>
                {s.counts.REPEAT ? (
                  <Chip tone="late">{t('count_REPEAT', { count: s.counts.REPEAT })}</Chip>
                ) : null}
                {s.counts.EXAM ? (
                  <Chip tone="late">{t('count_EXAM', { count: s.counts.EXAM })}</Chip>
                ) : null}
                {s.counts.LEAVE ? (
                  <Chip tone="absent">{t('count_LEAVE', { count: s.counts.LEAVE })}</Chip>
                ) : null}
              </p>
            ) : null}
          </Card>
        </section>
      ) : null}

      <Sheet
        open={failed !== null}
        onOpenChange={(o) => !o && setFailed(null)}
        title={t('failedConfirm', { name: failed?.name ?? '' })}
        description={t('failedConfirmText', { name: failed?.fromClass ?? '' })}
        closeLabel={tc('close')}
      >
        {exam.error ? <FormError message={problem(exam.error) ?? tc('error')} /> : null}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setFailed(null)}>
            {tc('cancel')}
          </Button>
          <Button
            loading={exam.isPending}
            onClick={() =>
              failed &&
              exam.mutate(
                { studentId: failed.studentId, passed: false },
                {
                  onSuccess: (r) => {
                    setFailed(null);
                    toast({
                      text: t('movedToast', { name: failed.name, class: r.movedTo?.name ?? '' }),
                    });
                  },
                },
              )
            }
          >
            {t('failedAction')}
          </Button>
        </div>
      </Sheet>
    </>
  );
}
