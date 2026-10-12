'use client';
import Link from 'next/link';
import { fachColorOf, type PlanEntry } from '@sp/shared';
import { FACH_BG, StatusBadge, cn } from '@sp/ui';
import { timeOf } from '../../lib/dates';
import { NowLineSlot } from '../now-line';
import { useT } from '../../lib/i18n';

/** Wer neben dem Fach steht: für Schüler:innen Raum und Lehrkraft, für Lehrkräfte Klasse und Raum. */
export type Perspective = 'student' | 'teacher';

export function PlanStatusBadge({ entry }: { entry: PlanEntry }) {
  const t = useT('plan');
  if (entry.status === 'SCHEDULED') return null;
  const status =
    entry.status === 'CANCELLED'
      ? 'cancelled'
      : entry.status === 'SUBSTITUTED'
        ? 'substituted'
        : 'roomChanged';
  return <StatusBadge status={status} label={t(status)} />;
}

type Translate = (key: string, values?: Record<string, string | number>) => string;

export function periodLabel(t: Translate, e: Pick<PlanEntry, 'periodStart' | 'periodCount'>) {
  return e.periodCount > 1
    ? t('periods', { from: e.periodStart, to: e.periodStart + e.periodCount - 1 })
    : t('period', { n: e.periodStart });
}

export function lessonDetail(e: PlanEntry, perspective: Perspective): string {
  const who = e.class?.name ?? e.group?.name ?? '';
  const teachers = e.teachers.map((x) => x.name).join(', ');
  return (perspective === 'student' ? [e.room?.name, teachers] : [who, e.room?.name])
    .filter(Boolean)
    .join(' · ');
}

/** Eine Stunde in einer Tagesliste (OccurrenceCard der Spec). */
export function LessonRow({
  entry,
  perspective,
  href,
  past,
  trailing,
  highlight,
  timeline,
}: {
  entry: PlanEntry;
  perspective: Perspective;
  href?: string;
  past?: boolean;
  trailing?: React.ReactNode;
  highlight?: boolean;
  /** Zeitlinie zeigen; Wert = Ende der vorigen Stunde (null bei der ersten). */
  timeline?: { previousEndsAt: string | null };
}) {
  const t = useT('today');
  const cancelled = entry.status === 'CANCELLED';
  const body = (
    <>
      <div className="w-16 shrink-0 text-body-sm tabular-nums">
        <p className="font-medium">{timeOf(entry.startsAt)}</p>
        <p className="text-caption text-ink-muted">{periodLabel(t, entry)}</p>
      </div>
      <div
        aria-hidden="true"
        className={cn('h-10 w-1.5 shrink-0 rounded-pill', FACH_BG[fachColorOf(entry.subject)])}
      />
      <div className="min-w-0 flex-1">
        <p className={cn('truncate font-medium', cancelled && 'line-through')}>
          {entry.subject.name}
        </p>
        <p className="truncate text-body-sm text-ink-muted">{lessonDetail(entry, perspective)}</p>
        {entry.status !== 'SCHEDULED' || trailing ? (
          <div className="mt-1 flex flex-wrap items-center gap-1">
            <PlanStatusBadge entry={entry} />
            {trailing}
          </div>
        ) : null}
      </div>
    </>
  );
  const cls = cn(
    'flex min-h-16 items-center gap-3 px-4 py-2',
    past && 'bg-bg-sunken/40',
    highlight && 'bg-bg-sunken',
  );
  return (
    <li className="relative border-b border-line last:border-b-0">
      {timeline ? (
        <NowLineSlot
          startsAt={entry.startsAt}
          endsAt={entry.endsAt}
          previousEndsAt={timeline.previousEndsAt}
        />
      ) : null}
      {href ? (
        <Link href={href} className={cn(cls, 'hover:bg-bg-sunken')}>
          {body}
        </Link>
      ) : (
        <div className={cls}>{body}</div>
      )}
    </li>
  );
}
