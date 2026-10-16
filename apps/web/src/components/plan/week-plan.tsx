import { CalendarOff, NotebookPen } from 'lucide-react';
import {
  addDays,
  examOverlaps,
  fachColorOf,
  type PlanEntry,
  type PlanExam,
  type PlanResponse,
} from '@sp/shared';
import { Chip, EmptyState, StatusBadge, TimetableCell, TimetableGrid, cn } from '@sp/ui';
import { shortDate, todayVienna } from '../../lib/dates';
import { NowLineSlot } from '../now-line';
import { MobileDays } from './mobile-days';
import { PlanNowMarker } from './plan-now-marker';
import { PlanViews } from './plan-views';
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
 * Eintrag liegt unter einer Prüfung mit Stunden (ADR 0024): in Klassen- und Schülerplänen ersetzt der
 * Prüfungsblock alle Stunden dieser Zeit, in Lehrerplänen nur die Stunde des Prüfungsfachs (dort findet sie
 * statt); andere verdrängte Stunden bleiben als "entfällt (Schularbeit)" sichtbar.
 */
const coveredBy = (exams: PlanExam[], e: PlanEntry, perspective: PlanPerspective) =>
  exams.some(
    (x) =>
      examOverlaps(x, e) &&
      (perspective === 'student' ||
        (x.class !== null && e.class?.id === x.class.id && e.subject.id === x.subject.id)),
  );

type Item = { kind: 'lesson'; e: PlanEntry } | { kind: 'exam'; x: PlanExam };

/**
 * Wochenplan (Design System, Stundenplan): ab Tablet 5-Tage-Raster mit Fächerkacheln (Vertretung als
 * is-subst, Entfall als leere Kachel mit Wort), mobil wahlweise ein Tag mit Zeitleiste oder die Woche.
 * Schulfreie Tage stehen als eigener Eintrag, Prüfungen mit Stunden als Block mit goldenem Rahmen.
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
  const freeOf = new Map(plan.freeDays.map((f) => [f.date, f.label]));
  const blocks = plan.exams.filter((x) => x.periodStart !== null);
  const dayExams = plan.exams.filter((x) => x.periodStart === null && days.includes(x.date));
  const entries = plan.entries.filter((e) => !coveredBy(blocks, e, perspective));
  const itemsAt = new Map<string, Item[]>();
  const put = (key: string, item: Item) => itemsAt.set(key, [...(itemsAt.get(key) ?? []), item]);
  for (const e of entries) put(`${e.date}|${e.periodStart}`, { kind: 'lesson', e });
  for (const x of blocks) put(`${x.date}|${x.periodStart}`, { kind: 'exam', x });

  const freeInWeek = days.some((d) => freeOf.has(d));
  if (plan.entries.length === 0 && plan.exams.length === 0 && !freeInWeek) {
    return <EmptyState title={t('plan.empty')} />;
  }
  const examLabel = (x: PlanExam) =>
    `${t(`exams.kinds.${x.kind}`)} · ${x.subject.code}${x.class && perspective !== 'student' ? ` · ${x.class.name}` : ''}`;
  const examTime = (x: PlanExam) => {
    const end = x.periodStart! + x.periodCount - 1;
    const from = periods.find((p) => p.number === x.periodStart)?.startTime ?? '';
    const to = periods.find((p) => p.number === end)?.endTime ?? '';
    return `${from}–${to}`;
  };

  const dayList = (
    <MobileDays
      label={t('plan.days')}
      days={days.map((d, i) => ({
        key: d,
        label: t(`days.short${i + 1}`),
        current: d === today,
      }))}
    >
      {days.map((d, i) => {
        const free = freeOf.get(d);
        const items: Item[] = [
          ...entries.filter((e) => e.date === d).map((e) => ({ kind: 'lesson' as const, e })),
          ...blocks.filter((x) => x.date === d).map((x) => ({ kind: 'exam' as const, x })),
        ].sort((a, b) => startOf(a) - startOf(b));
        const notes = dayExams.filter((x) => x.date === d);
        return (
          <section key={d} aria-labelledby={`day-${d}`} className="flex flex-col gap-2">
            <h2
              id={`day-${d}`}
              aria-current={d === today ? 'date' : undefined}
              className={cn('text-overline', d === today ? 'text-brand-text' : 'text-ink-muted')}
            >
              {t(`days.${i + 1}`)} {shortDate(d)}
            </h2>
            {free ? <FreeDayCard label={free} title={t('plan.free')} /> : null}
            {notes.map((x) => (
              <Chip key={x.id} icon={NotebookPen} className="self-start">
                {examLabel(x)}
              </Chip>
            ))}
            {items.length === 0 && !free ? <p className="text-body-sm text-ink-muted">–</p> : null}
            <ul className="flex flex-col gap-2">
              {items.map((it, ei) => {
                if (it.kind === 'exam') {
                  const x = it.x;
                  return (
                    <li key={x.id} className="relative flex gap-3">
                      <span className="w-12 shrink-0 pt-3 text-mono-sm text-ink-muted">
                        {periods.find((p) => p.number === x.periodStart)?.startTime}
                      </span>
                      <div
                        className={cn(
                          'pf-tt__cell flex-1 cursor-default items-start text-left ring-3 ring-signal active:scale-100',
                          `is-${fachColorOf(x.subject)}`,
                        )}
                      >
                        <span className="flex items-center gap-1 text-label">
                          <NotebookPen aria-hidden="true" className="size-4" />
                          {examLabel(x)}
                        </span>
                        <small>
                          {x.title} · {examTime(x)}
                        </small>
                      </div>
                    </li>
                  );
                }
                const e = it.e;
                const prev = items[ei - 1];
                const st = statusOf(e);
                return (
                  <li key={e.id} className="relative flex gap-3">
                    <NowLineSlot
                      startsAt={e.startsAt}
                      endsAt={e.endsAt}
                      previousEndsAt={prev?.kind === 'lesson' ? prev.e.endsAt : null}
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
                        <StatusBadge
                          status={st}
                          label={
                            e.displacedBy
                              ? t('plan.displaced', {
                                  kind: t(`exams.kinds.${e.displacedBy.kind}`),
                                  subject: e.displacedBy.subject,
                                })
                              : t(`plan.${st}`)
                          }
                          className="mt-1"
                        />
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
  );

  const grid = (
    <TimetableGrid
      className="relative grid min-w-120 md:min-w-0"
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
      {days.map((d, di) => {
        const free = freeOf.get(d);
        if (!free) return null;
        return (
          <div
            key={`free-${d}`}
            className="flex flex-col items-center justify-center gap-1 rounded-md bg-bg-sunken p-2 text-center"
            style={{ gridColumn: di + 2, gridRow: `2 / span ${Math.max(1, periods.length)}` }}
          >
            <CalendarOff aria-hidden="true" className="size-5 text-ink-muted" />
            <span className="text-label">{t('plan.free')}</span>
            <small className="text-body-sm text-ink-muted">{free}</small>
          </div>
        );
      })}
      {days.flatMap((d, di) =>
        periods.map((p) => {
          const items = itemsAt.get(`${d}|${p.number}`);
          if (!items || freeOf.has(d)) return null;
          const span = Math.max(
            ...items.map((it) => (it.kind === 'lesson' ? it.e.periodCount : it.x.periodCount)),
          );
          return (
            <div
              key={`${d}|${p.number}`}
              className="flex gap-1"
              style={{
                gridColumn: di + 2,
                gridRow: `${(rowOf.get(p.number) ?? 0) + 2} / span ${span}`,
              }}
            >
              {items.map((it) => {
                if (it.kind === 'exam') {
                  const x = it.x;
                  return (
                    <TimetableCell
                      key={x.id}
                      column={0}
                      row={0}
                      className="flex-1 ring-3 ring-signal"
                      style={{ gridColumn: 'auto', gridRow: 'auto' }}
                      fach={fachColorOf(x.subject)}
                    >
                      <span className="sr-only">
                        {t(`days.${di + 1}`)} {shortDate(d)}, {examTime(x)}:
                      </span>
                      <span className="flex items-center gap-1">
                        <NotebookPen aria-hidden="true" className="size-4 shrink-0" />
                        <span className="md:hidden">{x.subject.code}</span>
                        <span className="hidden md:inline">{examLabel(x)}</span>
                      </span>
                      <small className="hidden md:block">{x.title}</small>
                    </TimetableCell>
                  );
                }
                const e = it.e;
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
                    stateLabel={
                      e.displacedBy
                        ? t('plan.displaced', {
                            kind: t(`exams.kinds.${e.displacedBy.kind}`),
                            subject: e.displacedBy.subject,
                          })
                        : st
                          ? t(`plan.${st}`)
                          : undefined
                    }
                  >
                    {/* Raster ist nur optisch; Tag und Stunde für Screenreader direkt am Eintrag */}
                    <span className="sr-only">
                      {t(`days.${di + 1}`)} {shortDate(d)}, {t('plan.period', { n: p.number })},{' '}
                      {p.startTime}:
                    </span>
                    <span className={cn(st === 'cancelled' && 'line-through')}>
                      <span className="md:hidden">{e.subject.code}</span>
                      <span className="hidden md:inline">
                        {items.length > 1 ? e.subject.code : e.subject.name}
                      </span>
                    </span>
                    <small className="hidden md:block">{detail(e, perspective)}</small>
                  </TimetableCell>
                );
              })}
            </div>
          );
        }),
      )}
    </TimetableGrid>
  );

  return (
    <div className="flex flex-col gap-3">
      {dayExams.length ? (
        <ul className="hidden flex-wrap gap-2 md:flex" aria-label={t('plan.examsWeek')}>
          {dayExams.map((x) => (
            <li key={x.id}>
              <Chip icon={NotebookPen}>
                {t(`days.short${days.indexOf(x.date) + 1}`)} · {examLabel(x)}
              </Chip>
            </li>
          ))}
        </ul>
      ) : null}
      <PlanViews
        label={t('plan.viewLabel')}
        dayLabel={t('plan.viewDay')}
        weekLabel={t('plan.viewWeek')}
        day={dayList}
        week={grid}
      />
    </div>
  );
}

const startOf = (it: Item) => (it.kind === 'lesson' ? it.e.periodStart : it.x.periodStart!);

function FreeDayCard({ label, title }: { label: string; title: string }) {
  return (
    <div className="flex items-center gap-3 rounded-lg bg-bg-sunken p-4">
      <CalendarOff aria-hidden="true" className="size-6 shrink-0 text-ink-muted" />
      <span className="flex flex-col">
        <span className="text-body-strong">{title}</span>
        <span className="text-body-sm text-ink-muted">{label}</span>
      </span>
    </div>
  );
}
