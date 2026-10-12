import { addDays, fachColorOf, type PlanEntry, type PlanResponse } from '@sp/shared';
import { EmptyState, StatusBadge, TimetableCell, TimetableGrid, cn } from '@sp/ui';
import { shortDate, todayVienna } from '../../lib/dates';
import { NowLineSlot } from '../now-line';
import { MobileDays } from './mobile-days';
import { PlanNowMarker } from './plan-now-marker';
import { getT } from '../../lib/nav-server';

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

type StatusKey = 'cancelled' | 'substituted' | 'roomChanged';
const statusOf = (e: PlanEntry): StatusKey | null =>
  e.status === 'CANCELLED'
    ? 'cancelled'
    : e.status === 'SUBSTITUTED'
      ? 'substituted'
      : e.status === 'SCHEDULED'
        ? null
        : 'roomChanged';

/**
 * Wochenplan (Design System, Stundenplan): ab Tablet 5-Tage-Raster mit Fächerkacheln (Vertretung als
 * is-subst, Entfall als leere Kachel mit Wort), mobil eine Tagesliste mit Zeitleiste.
 */
export async function WeekPlan({
  plan,
  perspective,
}: {
  plan: PlanResponse;
  perspective: PlanPerspective;
}) {
  const t = await getT();
  const days = [0, 1, 2, 3, 4].map((i) => addDays(plan.from, i));
  const today = todayVienna();
  const periods = plan.periods;
  const rowOf = new Map(periods.map((p, i) => [p.number, i]));
  const byStart = new Map<string, PlanEntry[]>();
  for (const e of plan.entries) {
    const key = `${e.date}|${e.periodStart}`;
    byStart.set(key, [...(byStart.get(key) ?? []), e]);
  }

  if (plan.entries.length === 0) {
    return <EmptyState title={t('plan.empty')} />;
  }

  return (
    <>
      {/* Mobil: ein Tag mit Zeitleiste, Wischen oder Tabs wechseln den Tag */}
      <MobileDays
        label={t('plan.days')}
        days={days.map((d, i) => ({
          key: d,
          label: t(`days.short${i + 1}`),
          current: d === today,
        }))}
      >
        {days.map((d, i) => {
          const entries = plan.entries.filter((e) => e.date === d);
          return (
            <section key={d} aria-labelledby={`day-${d}`} className="flex flex-col gap-2">
              <h2
                id={`day-${d}`}
                aria-current={d === today ? 'date' : undefined}
                className={cn('text-overline', d === today ? 'text-brand-text' : 'text-ink-muted')}
              >
                {t(`days.${i + 1}`)} {shortDate(d)}
              </h2>
              {entries.length === 0 ? <p className="text-body-sm text-ink-muted">–</p> : null}
              <ul className="flex flex-col gap-2">
                {entries.map((e, ei) => {
                  const st = statusOf(e);
                  return (
                    <li key={e.id} className="relative flex gap-3">
                      <NowLineSlot
                        startsAt={e.startsAt}
                        endsAt={e.endsAt}
                        previousEndsAt={ei > 0 ? entries[ei - 1]!.endsAt : null}
                      />
                      <span className="w-12 shrink-0 pt-3 text-mono-sm text-ink-muted">
                        {periods.find((p) => p.number === e.periodStart)?.startTime}
                        <span className="sr-only">, {t('plan.period', { n: e.periodStart })}</span>
                      </span>
                      <div
                        className={cn(
                          'pf-tt__cell flex-1 cursor-default items-start text-left active:scale-100',
                          st === 'cancelled'
                            ? 'pf-tt__cell--empty'
                            : st === 'substituted'
                              ? 'is-subst'
                              : `is-${fachColorOf(e.subject)}`,
                        )}
                      >
                        <span className={cn('text-label', st === 'cancelled' && 'line-through')}>
                          {e.subject.name}
                        </span>
                        <small>{detail(e, perspective)}</small>
                        {st ? (
                          <StatusBadge status={st} label={t(`plan.${st}`)} className="mt-1" />
                        ) : null}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}
      </MobileDays>

      {/* Ab Tablet: Raster mit Tagen als Spalten und Stunden als Zeilen */}
      <TimetableGrid
        className="relative hidden md:grid"
        ariaLabel={t('plan.title')}
        columns={days.map((d, i) => ({
          key: d,
          label: `${t(`days.short${i + 1}`)} ${shortDate(d)}`,
          current: d === today,
        }))}
        rows={periods.map((p) => ({
          key: String(p.number),
          label: String(p.number),
          title: `${p.startTime} – ${p.endTime}`,
        }))}
      >
        <PlanNowMarker days={days} periods={periods} />
        {days.flatMap((d, di) =>
          periods.map((p) => {
            const entries = byStart.get(`${d}|${p.number}`);
            if (!entries) return null;
            const span = Math.max(...entries.map((e) => e.periodCount));
            return (
              <div
                key={`${d}|${p.number}`}
                className="flex gap-1"
                style={{
                  gridColumn: di + 2,
                  gridRow: `${(rowOf.get(p.number) ?? 0) + 2} / span ${span}`,
                }}
              >
                {entries.map((e) => {
                  const st = statusOf(e);
                  return (
                    <TimetableCell
                      key={e.id}
                      column={0}
                      row={0}
                      className="flex-1"
                      style={{ gridColumn: 'auto', gridRow: 'auto' }}
                      fach={fachColorOf(e.subject)}
                      state={
                        st === 'cancelled' ? 'cancelled' : st === 'substituted' ? 'subst' : 'normal'
                      }
                      stateLabel={st ? t(`plan.${st}`) : undefined}
                    >
                      {/* Raster ist nur optisch; Tag und Stunde für Screenreader direkt am Eintrag */}
                      <span className="sr-only">
                        {t(`days.${di + 1}`)} {shortDate(d)}, {t('plan.period', { n: p.number })},{' '}
                        {p.startTime}:
                      </span>
                      <span className={cn(st === 'cancelled' && 'line-through')}>
                        {entries.length > 1 ? e.subject.code : e.subject.name}
                      </span>
                      <small>{detail(e, perspective)}</small>
                    </TimetableCell>
                  );
                })}
              </div>
            );
          }),
        )}
      </TimetableGrid>
    </>
  );
}
