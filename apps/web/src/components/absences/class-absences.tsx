'use client';
import { Check, TriangleAlert } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import type { AbsenceItem } from '@sp/shared';
import {
  Banner,
  Button,
  Card,
  EmptyState,
  SegmentedNav,
  Sheet,
  Skeleton,
  Textarea,
  TOAST_DURATION,
  cn,
  useToast,
} from '@sp/ui';
import { useApi, useApiMutation, useProblemText } from '../../lib/use-api';
import { AbsenceList, absenceRange } from './absence-list';
import { ExcuseReviewRow } from './excuse-review-row';
import { useT } from '../../lib/i18n';
import { PageTitle } from '../page-title';
import { FormError } from '../form-bits';

type Tab = 'entschuldigungen' | 'fehlzeiten';
type Pending = { timer: ReturnType<typeof setTimeout>; run: () => void };

/**
 * Klassenvorstand (AB-02, Design System Screens 6): Entschuldigungen prüfen und Fehlzeiten der Klasse.
 * "Entschuldigen" und Wischen nach rechts entschuldigen sofort mit Rückgängig; "Mit Kommentar" öffnet ein Sheet.
 */
export function ClassAbsences({
  classId,
  className,
  tab,
}: {
  classId: string;
  className: string;
  tab: Tab;
}) {
  const t = useT('klasse');
  const ta = useT('absence');
  const tc = useT('common');
  const problem = useProblemText();
  const toast = useToast();
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

  // Schnell entschuldigen: Die Zeile verschwindet sofort, gespeichert wird erst nach Ablauf des Toasts
  // (Rückgängig ohne eigene API). Verlässt man die Seite vorher, wird sofort gespeichert.
  const [hidden, setHidden] = useState<ReadonlySet<string>>(() => new Set());
  const [failed, setFailed] = useState<string | null>(null);
  const pending = useRef(new Map<string, Pending>());
  const send = useRef(review.mutateAsync);
  useEffect(() => {
    send.current = review.mutateAsync;
  });
  useEffect(() => {
    const map = pending.current;
    return () => {
      for (const p of map.values()) {
        clearTimeout(p.timer);
        p.run();
      }
      map.clear();
    };
  }, []);
  const setVisible = (id: string, visible: boolean) =>
    setHidden((h) => {
      const n = new Set(h);
      if (visible) n.delete(id);
      else n.add(id);
      return n;
    });
  const quickExcuse = (a: AbsenceItem) => {
    const name = `${a.student.firstName} ${a.student.lastName}`;
    setFailed(null);
    setVisible(a.id, false);
    const run = () => {
      pending.current.delete(a.id);
      send.current({ id: a.id, decision: 'EXCUSED', comment: null }).catch(() => {
        setVisible(a.id, true);
        setFailed(t('excuseFailed', { name }));
      });
    };
    pending.current.set(a.id, { timer: setTimeout(run, TOAST_DURATION), run });
    toast({
      text: t('excusedToast', { name }),
      icon: Check,
      action: {
        label: tc('undo'),
        onClick: () => {
          const p = pending.current.get(a.id);
          if (p) clearTimeout(p.timer);
          pending.current.delete(a.id);
          setVisible(a.id, true);
        },
      },
    });
  };
  const visibleToReview = toReview.filter((a) => !hidden.has(a.id));

  const section = (id: string, title: string, items: AbsenceItem[]) =>
    items.length === 0 ? null : (
      <section className="flex flex-col gap-3" aria-labelledby={id}>
        <h2 id={id} className="text-h3">
          {title} <span className="text-ink-muted">({items.length})</span>
        </h2>
        <Card className="p-0">
          <AbsenceList items={items} showStudent onReview={(a) => setCurrent(a)} />
        </Card>
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
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 pt-4 pb-8 lg:px-6 lg:pt-6">
      <PageTitle area="klassenvorstand">{className}</PageTitle>
      <SegmentedNav
        label={t('sections')}
        linkAs={Link}
        items={(['entschuldigungen', 'fehlzeiten'] as const).map((target) => ({
          key: target,
          href: `/klasse/${classId}/${target}`,
          label: target === 'entschuldigungen' ? t('excuses') : t('absences'),
          current: tab === target,
        }))}
      />
      {q.isPending ? (
        <div className="flex flex-col gap-3" aria-hidden="true">
          <Skeleton className="h-24 w-full rounded-lg" />
          <Skeleton className="h-24 w-full rounded-lg" />
        </div>
      ) : q.isError ? (
        <Banner
          tone="danger"
          icon={TriangleAlert}
          action={
            <Button size="sm" variant="secondary" onClick={() => void q.refetch()}>
              {tc('retry')}
            </Button>
          }
        >
          {problem(q.error) ?? tc('error')}
        </Banner>
      ) : tab === 'entschuldigungen' ? (
        <>
          {failed ? (
            <Banner tone="danger" icon={TriangleAlert}>
              {failed}
            </Banner>
          ) : null}
          <section className="flex flex-col gap-3" aria-labelledby="to-review">
            <div className="flex flex-col gap-1">
              <h2 id="to-review" className="text-h3">
                {t('toReview')} <span className="text-ink-muted">({visibleToReview.length})</span>
              </h2>
              {visibleToReview.length > 0 ? (
                <p className="text-caption text-ink-muted lg:hidden">{t('swipeHint')}</p>
              ) : null}
            </div>
            {visibleToReview.length === 0 ? (
              <Card flat>
                <EmptyState as="h3" title={t('nothingToReview')} />
              </Card>
            ) : (
              <Card className="p-0">
                <ul>
                  {visibleToReview.map((a) => (
                    <ExcuseReviewRow
                      key={a.id}
                      item={a}
                      busy={review.isPending}
                      onExcuse={() => quickExcuse(a)}
                      onComment={() => setCurrent(a)}
                    />
                  ))}
                </ul>
              </Card>
            )}
          </section>
          {section('open-h', t('open'), open)}
          {section('decided-h', t('decided'), decided)}
        </>
      ) : (
        <section aria-labelledby="per-student" className="flex flex-col gap-3">
          <h2 id="per-student" className="text-h3">
            {t('perStudent')}
          </h2>
          {perStudent.size === 0 ? (
            <Card flat>
              <EmptyState as="h3" title={ta('listEmpty')} />
            </Card>
          ) : (
            <Card className="overflow-x-auto p-0">
              <table className="w-full text-body-sm">
                <thead>
                  <tr className="text-left text-label text-ink-muted">
                    <th scope="col" className="px-4 py-2">
                      {t('students')}
                    </th>
                    <th scope="col" className="px-4 py-2 text-right">
                      {t('excused')}
                    </th>
                    <th scope="col" className="px-4 py-2 text-right">
                      {t('unexcused')}
                    </th>
                    <th scope="col" className="px-4 py-2 text-right">
                      {t('pending')}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {[...perStudent.values()]
                    .sort((a, b) => a.name.localeCompare(b.name, 'de'))
                    .map((r) => (
                      <tr key={r.name} className="border-t border-line">
                        <th scope="row" className="px-4 py-2 text-left text-body-sm">
                          {r.name}
                        </th>
                        <td className="px-4 py-2 text-right text-mono">{r.excused}</td>
                        <td
                          className={cn(
                            'px-4 py-2 text-right text-mono',
                            r.unexcused > 0 && 'text-signal-ink',
                          )}
                        >
                          {r.unexcused}
                        </td>
                        <td className="px-4 py-2 text-right text-mono">{r.pending}</td>
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
        {review.error && current ? <FormError message={problem(review.error)} /> : null}
        <div className="flex flex-wrap gap-2">
          <Button disabled={review.isPending} onClick={() => void decide('EXCUSED')}>
            {t('accept')}
          </Button>
          <Button
            variant="secondary"
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
