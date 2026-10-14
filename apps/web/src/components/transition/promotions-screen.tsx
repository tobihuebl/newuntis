'use client';
import { ArrowLeft, TriangleAlert } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { PROMOTION_DECISIONS, type PromotionDecision, type PromotionsView } from '@sp/shared';
import {
  Banner,
  Button,
  Card,
  Chip,
  EmptyState,
  Input,
  Select,
  Skeleton,
  cn,
  useToast,
} from '@sp/ui';
import { useApi, useApiMutation, useProblemText } from '../../lib/use-api';
import { useT } from '../../lib/i18n';
import { FormError } from '../form-bits';
import { LoadError } from '../load-error';
import { PageTitle } from '../page-title';

type Draft = Record<string, { decision: PromotionDecision; note: string }>;

/**
 * Schuljahresende einer Klasse (SD-05): je Schüler:in steigt auf (Standard), wiederholt,
 * Wiederholungsprüfung oder verlässt die Schule. Die Klassenkonferenz entscheidet, hier wird eingetragen;
 * Fächer mit Durchschnitt "Nicht genügend" stehen als Hinweis daneben.
 */
export function PromotionsScreen({ classId }: { classId: string }) {
  const t = useT('transition');
  const tc = useT('common');
  const problem = useProblemText();
  const toast = useToast();
  const key = ['promotions', classId];
  const q = useApi<PromotionsView>(key, `/promotions?classId=${classId}`);
  const save = useApiMutation<{
    classId: string;
    items: { studentId: string; decision: PromotionDecision; note: string | null }[];
  }>('PUT', () => '/promotions', [key, ['promotions', 'summary', classId]]);
  const [draft, setDraft] = useState<Draft>({});
  const d = q.data;
  const label = (k: PromotionDecision) =>
    k === 'PROMOTE' && d?.finalLevel ? t('decision_GRADUATE') : t(`decision_${k}`);
  const changed = Object.keys(draft).length;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 pt-4 pb-8 lg:px-6 lg:pt-6">
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
            <PageTitle area="klassenvorstand">{t('title', { name: d.className })}</PageTitle>
            <p className="text-body-sm text-ink-muted">
              {d.nextYear ? t('intro', { year: d.nextYear.name }) : t('noNextYear')}
            </p>
          </div>
          {d.rows.length === 0 ? (
            <Card flat>
              <EmptyState title={t('noStudents')} />
            </Card>
          ) : (
            <Card className="p-0">
              <ul>
                {d.rows.map((r) => {
                  const cur = draft[r.studentId] ?? { decision: r.decision, note: r.note ?? '' };
                  const special = cur.decision !== 'PROMOTE';
                  return (
                    <li
                      key={r.studentId}
                      className={cn(
                        'flex flex-col gap-2 border-b border-line px-4 py-3 last:border-b-0',
                        special && 'bg-signal-soft',
                      )}
                    >
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                        <span className="flex min-w-40 flex-1 flex-col gap-1">
                          <span className="text-body-strong">{r.name}</span>
                          {r.failing.length ? (
                            <Chip tone="late" icon={TriangleAlert} className="self-start">
                              {t('failing', { subjects: r.failing.join(', ') })}
                            </Chip>
                          ) : null}
                        </span>
                        <Select
                          label={t('decisionFor', { name: r.name })}
                          hideLabel
                          value={cur.decision}
                          fieldClassName="w-full sm:w-56"
                          onChange={(e) =>
                            setDraft({
                              ...draft,
                              [r.studentId]: {
                                ...cur,
                                decision: e.target.value as PromotionDecision,
                              },
                            })
                          }
                          options={PROMOTION_DECISIONS.map((k) => ({ value: k, label: label(k) }))}
                        />
                      </div>
                      {special ? (
                        <Input
                          label={t('note')}
                          value={cur.note}
                          maxLength={300}
                          placeholder={t('notePlaceholder')}
                          onChange={(e) =>
                            setDraft({ ...draft, [r.studentId]: { ...cur, note: e.target.value } })
                          }
                        />
                      ) : null}
                      {cur.decision === 'EXAM' ? (
                        <p className="text-caption text-ink-muted">{t('examHint')}</p>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            </Card>
          )}
          {save.error ? <FormError message={problem(save.error) ?? tc('error')} /> : null}
          {d.rows.length ? (
            <div className="sticky bottom-[calc(var(--tabbar-h)+env(safe-area-inset-bottom))] z-nav -mx-4 flex items-center justify-between gap-3 bg-bg px-4 py-3 lg:bottom-0 lg:mx-0 lg:px-0">
              <span className="text-body-sm text-ink-muted" aria-live="polite">
                {changed ? t('unsaved', { count: changed }) : t('saved')}
              </span>
              <Button
                disabled={changed === 0}
                loading={save.isPending}
                onClick={() =>
                  save.mutate(
                    {
                      classId,
                      items: Object.entries(draft).map(([studentId, v]) => ({
                        studentId,
                        decision: v.decision,
                        note: v.decision === 'PROMOTE' ? null : v.note.trim() || null,
                      })),
                    },
                    {
                      onSuccess: () => {
                        setDraft({});
                        toast({ text: t('savedToast') });
                      },
                    },
                  )
                }
              >
                {tc('save')}
              </Button>
            </div>
          ) : null}
          <Banner tone="brand">{t('conferenceHint')}</Banner>
        </>
      )}
    </div>
  );
}
