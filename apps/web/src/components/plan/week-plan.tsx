import { getTranslations } from 'next-intl/server';
import { addDays, type PlanEntry, type PlanResponse } from '@sp/shared';
import { StatusBadge, cn } from '@sp/ui';
import { shortDate } from '../../lib/dates';

/** Was in einer Karte neben dem Fach steht: bei Klassenplänen die Lehrkraft, bei Lehrer- und Raumplänen die Klasse. */
export type PlanPerspective = 'student' | 'teacher' | 'room';

function detail(e: PlanEntry, perspective: PlanPerspective): string {
  const who = e.class?.name ?? e.group?.name ?? '';
  const teachers = e.teachers.map((t) => t.name.split(' ').slice(-1)[0]).join(', ');
  const parts =
    perspective === 'student'
      ? [e.room?.name, teachers]
      : perspective === 'teacher'
        ? [who, e.room?.name]
        : [who, teachers];
  return parts.filter(Boolean).join(' · ');
}

async function EntryCard({
  e,
  perspective,
  compact,
}: {
  e: PlanEntry;
  perspective: PlanPerspective;
  compact?: boolean;
}) {
  const t = await getTranslations('plan');
  const cancelled = e.status === 'CANCELLED';
  return (
    <div
      className={cn(
        'flex h-full flex-col gap-0.5 rounded-sm border border-border bg-surface p-2 text-sm',
        cancelled && 'opacity-80',
      )}
      style={{ borderLeft: `4px solid ${e.subject.color ?? 'var(--primary)'}` }}
    >
      <p className={cn('font-medium', cancelled && 'line-through')}>
        {compact ? e.subject.code : e.subject.name}
      </p>
      <p className="text-xs text-muted">{detail(e, perspective)}</p>
      {e.status !== 'SCHEDULED' ? (
        <StatusBadge
          status={
            e.status === 'CANCELLED'
              ? 'cancelled'
              : e.status === 'SUBSTITUTED'
                ? 'substituted'
                : 'roomChanged'
          }
          label={t(
            e.status === 'CANCELLED'
              ? 'cancelled'
              : e.status === 'SUBSTITUTED'
                ? 'substituted'
                : 'roomChanged',
          )}
          className="self-start"
        />
      ) : null}
    </div>
  );
}

export async function WeekPlan({
  plan,
  perspective,
}: {
  plan: PlanResponse;
  perspective: PlanPerspective;
}) {
  const t = await getTranslations();
  const days = [0, 1, 2, 3, 4].map((i) => addDays(plan.from, i));
  const periods = plan.periods;
  const rowOf = new Map(periods.map((p, i) => [p.number, i + 2]));
  const byStart = new Map<string, PlanEntry[]>();
  for (const e of plan.entries) {
    const key = `${e.date}|${e.periodStart}`;
    byStart.set(key, [...(byStart.get(key) ?? []), e]);
  }

  if (plan.entries.length === 0) {
    return (
      <p className="rounded-md border border-border bg-surface p-6 text-center text-muted">
        {t('plan.empty')}
      </p>
    );
  }

  return (
    <>
      {/* Mobil: Liste je Tag */}
      <div className="flex flex-col gap-4 md:hidden">
        {days.map((d, i) => {
          const entries = plan.entries.filter((e) => e.date === d);
          return (
            <section key={d} aria-labelledby={`day-${d}`}>
              <h2 id={`day-${d}`} className="mb-2 font-semibold">
                {t(`days.${i + 1}`)} {shortDate(d)}
              </h2>
              {entries.length === 0 ? <p className="text-sm text-muted">–</p> : null}
              <ul className="flex flex-col gap-2">
                {entries.map((e) => (
                  <li key={e.id} className="flex gap-3">
                    <span className="w-14 shrink-0 pt-2 text-xs text-muted tabular-nums">
                      {periods.find((p) => p.number === e.periodStart)?.startTime}
                      <br />
                      {t('plan.period', { n: e.periodStart })}
                    </span>
                    <div className="flex-1">
                      <EntryCard e={e} perspective={perspective} />
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>

      {/* Ab Tablet: Raster mit Tagen als Spalten und Stunden als Zeilen */}
      <div
        className="hidden gap-1 md:grid"
        style={{
          gridTemplateColumns: '4.5rem repeat(5, minmax(0, 1fr))',
          gridTemplateRows: `auto repeat(${periods.length}, minmax(4.5rem, auto))`,
        }}
        role="table"
        aria-label={t('plan.title')}
      >
        <div role="columnheader" />
        {days.map((d, i) => (
          <div
            key={d}
            role="columnheader"
            className="px-1 pb-1 text-sm font-semibold"
            style={{ gridColumn: i + 2, gridRow: 1 }}
          >
            {t(`days.short${i + 1}`)} {shortDate(d)}
          </div>
        ))}
        {periods.map((p, i) => (
          <div
            key={p.number}
            role="rowheader"
            className="pr-1 text-right text-xs text-muted tabular-nums"
            style={{ gridColumn: 1, gridRow: i + 2 }}
          >
            <span className="font-medium text-text">{p.number}.</span>
            <br />
            {p.startTime}
            <br />
            {p.endTime}
          </div>
        ))}
        {days.flatMap((d, di) =>
          periods.map((p) => {
            const entries = byStart.get(`${d}|${p.number}`);
            if (!entries) return null;
            const span = Math.max(...entries.map((e) => e.periodCount));
            return (
              <div
                key={`${d}|${p.number}`}
                role="cell"
                className="flex flex-col gap-1"
                style={{ gridColumn: di + 2, gridRow: `${rowOf.get(p.number)} / span ${span}` }}
              >
                {entries.map((e) => (
                  <div key={e.id} className="flex-1">
                    <EntryCard e={e} perspective={perspective} compact={entries.length > 1} />
                  </div>
                ))}
              </div>
            );
          }),
        )}
      </div>
    </>
  );
}
