'use client';
import { Check, Clock, FileCheck, FileWarning, X } from 'lucide-react';
import Link from 'next/link';
import type { AbsenceItem, AbsenceStatusName } from '@sp/shared';
import { Chip, Button, cn } from '@sp/ui';
import { apiRequest } from '../../lib/api-client';
import { longDate, timeOf, weekdayDate } from '../../lib/dates';
import { useT } from '../../lib/i18n';

const TONE: Record<AbsenceStatusName, 'neutral' | 'late' | 'ok' | 'danger' | 'ok'> = {
  OPEN: 'late',
  REPORTED: 'ok',
  EXCUSED: 'ok',
  REJECTED: 'danger',
  UNEXCUSED: 'danger',
};
const ICON = { OPEN: Clock, REPORTED: FileCheck, EXCUSED: Check, REJECTED: X, UNEXCUSED: X };

const viennaDate = (iso: string) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Vienna' }).format(new Date(iso));

/** Zeitraum verständlich: ganzer Tag, Uhrzeiten an einem Tag oder von–bis. */
export function absenceRange(a: Pick<AbsenceItem, 'fromAt' | 'toAt'>): string {
  const from = viennaDate(a.fromAt);
  const to = viennaDate(a.toAt);
  const wholeDay = timeOf(a.fromAt) === '00:00' && timeOf(a.toAt) === '23:59';
  if (from === to)
    return wholeDay
      ? longDate(from)
      : `${weekdayDate(from)}, ${timeOf(a.fromAt)}–${timeOf(a.toAt)}`;
  return `${weekdayDate(from)} – ${weekdayDate(to)}`;
}

export function AbsenceStatusBadge({ status }: { status: AbsenceStatusName }) {
  const t = useT('absence');
  const Icon = ICON[status];
  return (
    <Chip tone={TONE[status]}>
      <Icon aria-hidden="true" size={14} />
      {t(`status.${status}`)}
    </Chip>
  );
}

/** Liste von Fehlzeiten; Aktionen je nach Recht (entschuldigen bzw. prüfen). */
export function AbsenceList({
  items,
  showStudent,
  onReview,
  onUpload,
}: {
  items: AbsenceItem[];
  showStudent?: boolean;
  onReview?: (a: AbsenceItem) => void;
  onUpload?: (a: AbsenceItem) => void;
}) {
  const t = useT('absence');
  const tk = useT('klasse');
  const excuseHref = (a: AbsenceItem) =>
    `/abwesenheit/neu?kind=${a.student.id}&von=${viennaDate(a.fromAt)}&bis=${viennaDate(a.toAt)}`;
  return (
    <ul>
      {items.map((a) => (
        <li
          key={a.id}
          className="flex flex-col gap-2 border-b border-line px-4 py-3 last:border-b-0"
          data-absence={a.status}
        >
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              {showStudent ? (
                <p className="font-medium">
                  {a.student.lastName} {a.student.firstName}
                </p>
              ) : null}
              <p className={cn(!showStudent && 'font-medium')}>{absenceRange(a)}</p>
              <p className="text-body-sm text-ink-muted">
                {t('lessons', { n: a.lessons })} · {t(`origin_${a.origin}`)}
                {a.reasonCode ? ` · ${t(`reasons.${a.reasonCode}`)}` : ''}
              </p>
              {a.reason ? <p className="text-body-sm">{a.reason}</p> : null}
              {a.deadline ? (
                <p className="text-body-sm text-signal-ink">
                  {t('deadline', { date: weekdayDate(a.deadline) })}
                </p>
              ) : null}
              {a.reviewComment ? (
                <p className="text-body-sm text-ink-muted">
                  {t('comment')}: {a.reviewComment}
                </p>
              ) : null}
            </div>
            <AbsenceStatusBadge status={a.status} />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {a.attachmentRequired && !a.hasAttachment ? (
              <Chip tone="late">
                <FileWarning aria-hidden="true" size={14} />
                {t('attachmentMissing')}
              </Chip>
            ) : null}
            {a.canExcuse ? (
              <Button variant="secondary" asChild>
                <Link href={excuseHref(a)}>{t('excuse')}</Link>
              </Button>
            ) : null}
            {onUpload && a.status === 'REPORTED' && !a.hasAttachment && !a.canReview ? (
              <Button variant="secondary" onClick={() => onUpload(a)}>
                {t('addAttachment')}
              </Button>
            ) : null}
            {a.hasAttachment && a.canReview ? (
              <Button
                variant="ghost"
                onClick={async () => {
                  const r = await apiRequest<{ url: string }>(
                    'GET',
                    `/absences/${a.id}/attachment`,
                  );
                  window.open(r.url, '_blank', 'noopener');
                }}
              >
                {t('attachment')}
              </Button>
            ) : null}
            {onReview && a.canReview && a.status !== 'EXCUSED' ? (
              <Button onClick={() => onReview(a)}>{tk('reviewTitle')}</Button>
            ) : null}
          </div>
        </li>
      ))}
    </ul>
  );
}
