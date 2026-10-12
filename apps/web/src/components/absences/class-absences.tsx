'use client';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import type { AbsenceItem } from '@sp/shared';
import { Button, Card, EmptyState, Sheet, Skeleton, Textarea, cn } from '@sp/ui';
import { useApi, useApiMutation, useProblemText } from '../../lib/use-api';
import { AbsenceList, absenceRange } from './absence-list';

type Tab = 'entschuldigungen' | 'fehlzeiten';

/** Klassenvorstand (AB-02): Entschuldigungen prüfen und Fehlzeiten der Klasse. */
export function ClassAbsences({
  classId,
  className,
  tab,
}: {
  classId: string;
  className: string;
  tab: Tab;
}) {
  const t = useTranslations('klasse');
  const ta = useTranslations('absence');
  const tc = useTranslations('common');
  const problem = useProblemText();
  const q = useApi<{ data: AbsenceItem[] }>(
    ['absences', 'class', classId],
    `/absences?classId=${classId}`,
  );
  const review = useApiMutation<{
    id: string;
    decision: 'EXCUSED' | 'REJECTED';
    comment: string | null;
  }>('PATCH', (b) => `/absences/${b.id}/review`, [['absences']]);
  const [current, setCurrent] = useState<AbsenceItem | null>(null);
  const [comment, setComment] = useState('');
  const all = q.data?.data ?? [];
  const toReview = all.filter((a) => a.status === 'REPORTED');
  const open = all.filter((a) => a.status === 'OPEN' || a.status === 'UNEXCUSED');
  const decided = all.filter((a) => a.status === 'EXCUSED' || a.status === 'REJECTED').slice(0, 20);

  const decide = async (decision: 'EXCUSED' | 'REJECTED') => {
    if (!current) return;
    await review.mutateAsync({ id: current.id, decision, comment: comment || null });
    setCurrent(null);
    setComment('');
  };

  const tabLink = (target: Tab, label: string) => (
    <Link
      href={`/klasse/${classId}/${target}`}
      aria-current={tab === target ? 'page' : undefined}
      className={cn(
        'inline-flex min-h-11 items-center rounded-sm px-4 text-label',
        tab === target
          ? 'bg-brand text-on-brand'
          : 'border border-line bg-bg-raised hover:bg-bg-sunken',
      )}
    >
      {label}
    </Link>
  );

  const section = (title: string, items: AbsenceItem[], empty?: string) => (
    <section className="flex flex-col gap-2" aria-label={title}>
      <h2 className="text-h3">
        {title} <span className="text-ink-muted">({items.length})</span>
      </h2>
      {items.length === 0 ? (
        empty ? (
          <Card>
            <p className="text-ink-muted">{empty}</p>
          </Card>
        ) : null
      ) : (
        <Card className="p-0">
          <AbsenceList items={items} showStudent onReview={(a) => setCurrent(a)} />
        </Card>
      )}
    </section>
  );

  // Fehlstunden je Schüler:in (entschuldigt / unentschuldigt / offen)
  const perStudent = new Map<
    string,
    { name: string; excused: number; unexcused: number; pending: number }
  >();
  for (const a of all) {
    const k = a.student.id;
    const row = perStudent.get(k) ?? {
      name: `${a.student.lastName} ${a.student.firstName}`,
      excused: 0,
      unexcused: 0,
      pending: 0,
    };
    if (a.status === 'EXCUSED') row.excused += a.lessons;
    else if (a.status === 'UNEXCUSED' || a.status === 'REJECTED') row.unexcused += a.lessons;
    else row.pending += a.lessons;
    perStudent.set(k, row);
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4 p-4">
      <h1 className="text-h1">{className}</h1>
      <nav aria-label={t('title')} className="flex flex-wrap gap-2">
        {tabLink('entschuldigungen', t('excuses'))}
        {tabLink('fehlzeiten', t('absences'))}
      </nav>
      {q.isPending ? (
        <Skeleton className="h-40 w-full" />
      ) : q.isError ? (
        <Card>
          <EmptyState title={problem(q.error) ?? tc('error')} />
        </Card>
      ) : tab === 'entschuldigungen' ? (
        <>
          {section(t('toReview'), toReview, t('nothingToReview'))}
          {section(t('open'), open)}
          {section(t('decided'), decided)}
        </>
      ) : (
        <section aria-label={t('perStudent')} className="flex flex-col gap-2">
          <h2 className="text-h3">{t('perStudent')}</h2>
          {perStudent.size === 0 ? (
            <Card>
              <p className="text-ink-muted">{ta('listEmpty')}</p>
            </Card>
          ) : (
            <Card className="overflow-x-auto p-0">
              <table className="w-full text-body-sm">
                <thead>
                  <tr className="text-left text-ink-muted">
                    <th scope="col" className="px-4 py-2 font-medium">
                      {t('students')}
                    </th>
                    <th scope="col" className="px-4 py-2 text-right font-medium">
                      {t('excused')}
                    </th>
                    <th scope="col" className="px-4 py-2 text-right font-medium">
                      {t('unexcused')}
                    </th>
                    <th scope="col" className="px-4 py-2 text-right font-medium">
                      {t('pending')}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {[...perStudent.values()]
                    .sort((a, b) => a.name.localeCompare(b.name, 'de'))
                    .map((r) => (
                      <tr key={r.name} className="border-t border-line">
                        <th scope="row" className="px-4 py-2 text-left font-normal">
                          {r.name}
                        </th>
                        <td className="px-4 py-2 text-right tabular-nums">{r.excused}</td>
                        <td
                          className={cn(
                            'px-4 py-2 text-right tabular-nums',
                            r.unexcused > 0 && 'font-semibold text-danger-ink',
                          )}
                        >
                          {r.unexcused}
                        </td>
                        <td className="px-4 py-2 text-right tabular-nums">{r.pending}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </Card>
          )}
        </section>
      )}
      <Sheet
        open={current !== null}
        onOpenChange={(o) => (o ? undefined : setCurrent(null))}
        title={t('reviewTitle')}
        description={
          current
            ? `${current.student.lastName} ${current.student.firstName} · ${absenceRange(current)}`
            : undefined
        }
        closeLabel={tc('close')}
      >
        {current?.reason ? <p className="text-body-sm">{current.reason}</p> : null}
        <Textarea
          label={t('commentOptional')}
          value={comment}
          onChange={(e) => setComment(e.target.value)}
        />
        {review.error ? (
          <p role="alert" className="text-body-sm text-danger-ink">
            {problem(review.error)}
          </p>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <Button disabled={review.isPending} onClick={() => void decide('EXCUSED')}>
            {t('accept')}
          </Button>
          <Button
            variant="destructive"
            disabled={review.isPending}
            onClick={() => void decide('REJECTED')}
          >
            {t('reject')}
          </Button>
        </div>
      </Sheet>
    </div>
  );
}
