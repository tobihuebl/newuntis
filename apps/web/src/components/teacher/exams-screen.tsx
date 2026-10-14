'use client';
import { useState } from 'react';
import { ChevronLeft, ChevronRight, Info, Plus, TriangleAlert } from 'lucide-react';
import {
  EXAM_KINDS,
  addDays,
  examCollisions,
  fachColorOf,
  mondayOf,
  type ExamItem,
  type ExamWarning,
} from '@sp/shared';
import {
  Banner,
  Button,
  Card,
  Chip,
  EmptyState,
  Input,
  SegmentedControl,
  Select,
  Sheet,
  Skeleton,
  cn,
  useToast,
} from '@sp/ui';
import { FormError } from '../form-bits';
import { ApiError } from '../../lib/api-client';
import { todayVienna, weekdayDate } from '../../lib/dates';
import { useApi, useApiMutation, useProblemText } from '../../lib/use-api';
import { useT } from '../../lib/i18n';
import { PageTitle } from '../page-title';

interface Options {
  classes: { id: string; name: string; subjects: { id: string; name: string }[] }[];
}

const monthStart = (d: string) => `${d.slice(0, 7)}-01`;
function addMonths(first: string, n: number): string {
  const [y, m] = first.split('-').map(Number) as [number, number];
  const date = new Date(Date.UTC(y, m - 1 + n, 1));
  return date.toISOString().slice(0, 10);
}
const monthEnd = (first: string) => addDays(addMonths(first, 1), -1);
/** Zwei Prüfungen einer Klasse am selben Tag = Kollision (Design System, Prüfungskalender). */
const collisionKey = (x: ExamItem) => `${x.date}|${x.class?.id ?? ''}`;

/**
 * Prüfungskalender (PN-01, Design System "Prüfungskalender"): Monatsraster ab Tablet, mobil eine Liste nach
 * Wochen. Prüfungen als Kacheln in Fächerfarbe, Kollisionen als Amber-Kachel mit Wort. Neue Prüfung im Sheet
 * mit Kollisionsprüfung direkt unter dem Datum; Grenzwerte der Schule prüft zusätzlich der Server.
 */
export function ExamsScreen({ canWrite = true }: { canWrite?: boolean }) {
  const t = useT('exams');
  const tc = useT('common');
  const td = useT('days');
  const problem = useProblemText();
  const toast = useToast();
  const today = todayVienna();
  const [month, setMonth] = useState(monthStart(today));
  const options = useApi<Options>(['exams', 'options'], canWrite ? '/exams/options' : null);
  const list = useApi<{ data: ExamItem[] }>(
    ['exams', 'list', month],
    `/exams?from=${mondayOf(month)}&to=${addDays(mondayOf(monthEnd(month)), 4)}`,
  );
  const create = useApiMutation<object, { warnings: ExamWarning[] }>('POST', () => '/exams', [
    ['exams'],
  ]);
  const remove = useApiMutation<string>('DELETE', (id) => `/exams/${id}`, [['exams']]);
  const [open, setOpen] = useState(false);
  const [classId, setClassId] = useState('');
  const [subjectId, setSubjectId] = useState('');
  const [date, setDate] = useState(addDays(today, 7));
  const [title, setTitle] = useState('');
  const [kind, setKind] = useState<(typeof EXAM_KINDS)[number]>('Schularbeit');
  const [warnings, setWarnings] = useState<ExamWarning[] | null>(null);
  const cls = options.data?.classes.find((c) => c.id === classId);
  const items = list.data?.data ?? [];
  const perKey = new Map<string, number>();
  for (const c of examCollisions(items)) perKey.set(`${c.date}|${c.classId}`, c.examIds.length);
  const sameDay = classId ? items.filter((x) => x.date === date && x.class?.id === classId) : [];
  const warningText = (w: ExamWarning[]) =>
    w
      .map((x) =>
        t(x.code === 'EXAM_DAY_LIMIT' ? 'dayLimit' : 'weekLimit', {
          count: x.count,
          limit: x.limit,
        }),
      )
      .join('; ');

  async function submit(force: boolean) {
    setWarnings(null);
    try {
      await create.mutateAsync({ classId, subjectId, date, title, kind, force });
      setTitle('');
      setOpen(false);
      toast({ text: t('saved') });
    } catch (err) {
      if (
        err instanceof ApiError &&
        err.problem.status === 409 &&
        Array.isArray(err.problem.warnings)
      )
        setWarnings(err.problem.warnings as ExamWarning[]);
    }
  }

  // Monatsraster Mo–Fr: von Montag der ersten bis Freitag der letzten Woche
  const weeks: string[][] = [];
  for (let w = mondayOf(month); w <= monthEnd(month); w = addDays(w, 7))
    weeks.push([0, 1, 2, 3, 4].map((i) => addDays(w, i)));
  const canCreate = (options.data?.classes.length ?? 0) > 0;

  return (
    <div className="mx-auto flex w-full max-w-(--content-max) flex-col gap-6 px-4 pt-4 pb-8 lg:px-6 lg:pt-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-2">
          <PageTitle area="unterricht">{t('title')}</PageTitle>
          <p className="text-body-sm text-ink-muted">{t('collisionHint')}</p>
        </div>
        {canCreate ? (
          <Button iconLeft={Plus} onClick={() => setOpen(true)}>
            {t('add')}
          </Button>
        ) : null}
      </header>

      <nav aria-label={t('month')} className="flex flex-wrap items-center gap-2">
        <Button
          variant="secondary"
          size="sm"
          aria-label={t('prevMonth')}
          onClick={() => setMonth(addMonths(month, -1))}
        >
          <ChevronLeft aria-hidden="true" />
        </Button>
        <p className="min-w-40 text-center text-h3" aria-live="polite">
          {monthLabel(month)}
        </p>
        <Button
          variant="secondary"
          size="sm"
          aria-label={t('nextMonth')}
          onClick={() => setMonth(addMonths(month, 1))}
        >
          <ChevronRight aria-hidden="true" />
        </Button>
        {month !== monthStart(today) ? (
          <Button variant="ghost" size="sm" onClick={() => setMonth(monthStart(today))}>
            {t('thisMonth')}
          </Button>
        ) : null}
      </nav>

      {options.data && !canCreate ? (
        <Banner tone="brand" icon={Info}>
          {t('noPairs')}
        </Banner>
      ) : null}

      {list.isPending ? (
        <Skeleton className="h-96 w-full rounded-lg" />
      ) : list.isError ? (
        <Banner
          tone="danger"
          icon={TriangleAlert}
          action={
            <Button size="sm" variant="secondary" onClick={() => void list.refetch()}>
              {tc('retry')}
            </Button>
          }
        >
          {tc('error')}
        </Banner>
      ) : (
        <>
          {/* Ab Tablet: Monatsraster */}
          <div
            role="region"
            aria-label={monthLabel(month)}
            className="hidden gap-2 md:grid md:grid-cols-5"
          >
            {[1, 2, 3, 4, 5].map((d) => (
              <p key={d} className="pf-tt__head">
                {tDays(d)}
              </p>
            ))}
            {weeks.flat().map((d) => {
              const exams = items.filter((x) => x.date === d);
              const outside = d.slice(0, 7) !== month.slice(0, 7);
              return (
                <div
                  key={d}
                  aria-current={d === today ? 'date' : undefined}
                  className={cn(
                    'flex min-h-28 flex-col gap-1 rounded-md p-2',
                    outside ? 'bg-bg' : 'bg-bg-raised shadow-card',
                    d === today && 'tt-now',
                  )}
                >
                  <span
                    className={cn('text-mono-sm', outside ? 'text-ink-subtle' : 'text-ink-muted')}
                  >
                    {Number(d.slice(8))}.
                  </span>
                  {exams.map((x) => (
                    <ExamTile key={x.id} x={x} collision={(perKey.get(collisionKey(x)) ?? 0) > 1} />
                  ))}
                </div>
              );
            })}
          </div>

          {/* Mobil: Liste nach Wochen */}
          <div className="flex flex-col gap-6 md:hidden">
            {items.filter((x) => x.date.slice(0, 7) === month.slice(0, 7)).length === 0 ? (
              <Card flat>
                <EmptyState title={t('none')} />
              </Card>
            ) : (
              weeks.map((w) => {
                const exams = items.filter(
                  (x) =>
                    x.date >= w[0]! && x.date <= w[4]! && x.date.slice(0, 7) === month.slice(0, 7),
                );
                if (exams.length === 0) return null;
                return (
                  <section
                    key={w[0]}
                    aria-label={t('week', { from: weekdayDate(w[0]!) })}
                    className="flex flex-col gap-2"
                  >
                    <h2 className="text-overline text-ink-muted">
                      {t('week', { from: weekdayDate(w[0]!) })}
                    </h2>
                    <Card className="p-0">
                      <ExamRows
                        items={exams}
                        collisions={exams
                          .filter((x) => (perKey.get(collisionKey(x)) ?? 0) > 1)
                          .map((x) => x.id)}
                        onDelete={(id) => remove.mutate(id)}
                      />
                    </Card>
                  </section>
                );
              })
            )}
          </div>
        </>
      )}

      <Sheet open={open} onOpenChange={setOpen} title={t('add')} closeLabel={tc('cancel')}>
        <form
          className="flex flex-col gap-4"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            void submit(false);
          }}
        >
          <Select
            label={t('class')}
            value={classId}
            emptyLabel="–"
            onChange={(e) => {
              setClassId(e.target.value);
              setSubjectId('');
            }}
            options={(options.data?.classes ?? []).map((c) => ({ value: c.id, label: c.name }))}
          />
          <Select
            label={t('subject')}
            value={subjectId}
            emptyLabel="–"
            disabled={!cls}
            onChange={(e) => setSubjectId(e.target.value)}
            options={(cls?.subjects ?? []).map((s) => ({ value: s.id, label: s.name }))}
          />
          <Input
            label={t('date')}
            type="date"
            min={today}
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
          {sameDay.length > 0 ? (
            <Banner icon={TriangleAlert}>
              {t('collisionLive', { count: sameDay.length, className: cls?.name ?? '' })}
            </Banner>
          ) : null}
          <SegmentedControl
            label={t('kind')}
            value={kind}
            onChange={setKind}
            options={EXAM_KINDS.map((k) => ({ value: k, label: t(`kinds.${k}`) }))}
          />
          <Input
            label={t('name')}
            value={title}
            maxLength={120}
            onChange={(e) => setTitle(e.target.value)}
          />
          {warnings ? (
            <Banner
              tone="signal"
              icon={TriangleAlert}
              action={
                <Button size="sm" variant="signal" onClick={() => void submit(true)}>
                  {t('force')}
                </Button>
              }
            >
              {t('warning', { messages: warningText(warnings) })}
            </Banner>
          ) : create.error &&
            !(create.error instanceof ApiError && create.error.problem.status === 409) ? (
            <FormError message={problem(create.error)} />
          ) : null}
          <Button
            type="submit"
            block
            loading={create.isPending}
            disabled={!classId || !subjectId || !title.trim()}
          >
            {t('save')}
          </Button>
        </form>
      </Sheet>
    </div>
  );

  function tDays(d: number) {
    return td(`short${d}`);
  }
}

const monthFmt = new Intl.DateTimeFormat('de-AT', {
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});
function monthLabel(first: string): string {
  return monthFmt.format(new Date(`${first}T00:00:00Z`));
}

/** Prüfung als Kachel in Fächerfarbe; Kollision als Amber-Kachel mit Icon und Wort. */
function ExamTile({ x, collision }: { x: ExamItem; collision: boolean }) {
  const t = useT('exams');
  return (
    <div
      className={cn(
        'pf-tt__cell min-h-0 cursor-default items-start p-2 text-left active:scale-100',
        collision ? 'is-conflict' : `is-${fachColorOf(x.subject)}`,
      )}
    >
      <span className="flex items-center gap-1">
        {collision ? <TriangleAlert aria-hidden="true" /> : null}
        {x.class?.name} · {x.subject.code}
      </span>
      <small className="line-clamp-2">{x.title}</small>
      {collision ? <small className="font-text">{t('collision')}</small> : null}
    </div>
  );
}

export function ExamRows({
  items,
  onDelete,
  collisions = [],
}: {
  items: ExamItem[];
  onDelete?: (id: string) => void;
  /** Ids von Prüfungen mit Kollision (zwei Prüfungen einer Klasse am selben Tag). */
  collisions?: string[];
}) {
  const t = useT('exams');
  return (
    <ul>
      {items.map((x) => (
        <li
          key={x.id}
          className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3 last:border-b-0"
        >
          <div className="min-w-0">
            <p className="text-body-strong">{x.title}</p>
            <p className="text-body-sm text-ink-muted">
              {x.subject.name}
              {x.class ? ` · ${x.class.name}` : ''} · {t(`kinds.${x.kind}`)}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {collisions.includes(x.id) ? (
              <Chip tone="solid" icon={TriangleAlert}>
                {t('collision')}
              </Chip>
            ) : null}
            <Chip tone="mono">{weekdayDate(x.date)}</Chip>
            {onDelete && x.canEdit ? (
              <Button variant="ghost" onClick={() => onDelete(x.id)}>
                {t('delete')}
              </Button>
            ) : null}
          </div>
        </li>
      ))}
    </ul>
  );
}
