'use client';
import { ArrowRight, Check, TriangleAlert } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { levelOf, type TransitionPlan } from '@sp/shared';
import {
  Banner,
  Button,
  Card,
  Checkbox,
  Chip,
  EmptyState,
  Input,
  Select,
  Skeleton,
  useToast,
} from '@sp/ui';
import { ApiError } from '../../lib/api-client';
import { shortDate } from '../../lib/dates';
import { useApi, useApiMutation, useProblemText } from '../../lib/use-api';
import { useT } from '../../lib/i18n';
import { FormError } from '../form-bits';
import { LoadError } from '../load-error';
import { PageTitle } from '../page-title';

interface Year {
  id: string;
  name: string;
  startsOn: string;
  isCurrent: boolean;
}

/**
 * Schuljahreswechsel für die Administration (SD-05): 1. Folgeklassen anlegen, 2. Entscheidungen der
 * Klassenvorstände prüfen, 3. Schüler:innen übernehmen. Danach Lehrkräfte, Stundenplan und Umstellen des
 * Schuljahres.
 */
export function TransitionScreen() {
  const t = useT('transition');
  const years = useApi<{ data: Year[] }>(['admin', 'school-years'], '/admin/school-years');
  const current = years.data?.data.find((y) => y.isCurrent);
  const future = (years.data?.data ?? []).filter((y) => current && y.startsOn > current.startsOn);
  const [toYearId, setToYearId] = useState('');
  useEffect(() => {
    if (!toYearId && future[0]) setToYearId(future[0].id);
  }, [future, toYearId]);

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 pt-4 pb-8 lg:px-6 lg:pt-6">
      <div className="flex flex-col gap-2">
        <PageTitle area="stammdaten">{t('adminTitle')}</PageTitle>
        <p className="text-body-sm text-ink-muted">{t('adminIntro')}</p>
      </div>
      {years.isPending ? (
        <Skeleton className="h-40 w-full rounded-lg" />
      ) : future.length === 0 ? (
        <Card flat>
          <EmptyState
            title={t('noTarget')}
            description={t('noTargetText')}
            action={
              <Button asChild>
                <Link href="/admin/schuljahr">{t('toYears')}</Link>
              </Button>
            }
          />
        </Card>
      ) : (
        <>
          {future.length > 1 ? (
            <Select
              label={t('targetYear')}
              value={toYearId}
              onChange={(e) => setToYearId(e.target.value)}
              options={future.map((y) => ({ value: y.id, label: y.name }))}
              fieldClassName="max-w-xs"
            />
          ) : null}
          {toYearId ? <Steps toYearId={toYearId} /> : null}
        </>
      )}
    </div>
  );
}

function Steps({ toYearId }: { toYearId: string }) {
  const t = useT('transition');
  const key = ['admin', 'year-transition', toYearId];
  const q = useApi<TransitionPlan>(key, `/admin/year-transition?toYearId=${toYearId}`);
  if (q.isPending) return <Skeleton className="h-64 w-full rounded-lg" />;
  if (!q.data) return <LoadError error={q.error} onRetry={() => void q.refetch()} />;
  const p = q.data;
  return (
    <>
      <p className="text-body">
        {t('fromTo', {
          from: p.fromYear.name,
          to: p.toYear.name,
          start: shortDate(p.toYear.startsOn),
        })}
      </p>
      <ClassesStep plan={p} queryKey={key} />
      <DecisionsStep plan={p} />
      <StudentsStep plan={p} queryKey={key} />
    </>
  );
}

// ───────────── 1. Klassen ─────────────

function ClassesStep({ plan, queryKey }: { plan: TransitionPlan; queryKey: unknown[] }) {
  const t = useT('transition');
  const tc = useT('common');
  const problem = useProblemText();
  const toast = useToast();
  const minLevel = useMemo(() => {
    const ls = plan.classes.map((c) => c.level).filter((l): l is number => l !== null);
    return ls.length ? Math.min(...ls) : null;
  }, [plan.classes]);
  const [names, setNames] = useState<Record<string, string>>(() =>
    Object.fromEntries(plan.classes.map((c) => [c.id, c.successor?.name ?? c.suggestion ?? ''])),
  );
  const [homeroom, setHomeroom] = useState<Record<string, boolean>>({});
  const [fresh, setFresh] = useState(() =>
    plan.targetClasses.length
      ? ''
      : plan.classes
          .filter((c) => c.level !== null && c.level === minLevel)
          .map((c) => c.name)
          .join(', '),
  );
  const save = useApiMutation<Record<string, unknown>, { created: number }>(
    'POST',
    () => '/admin/year-transition/classes',
    [queryKey],
  );
  const open = plan.classes.filter((c) => !c.successor);

  return (
    <section aria-labelledby="step1-h" className="flex flex-col gap-3">
      <h2 id="step1-h" className="text-h2">
        {t('step1')}
      </h2>
      <p className="text-body-sm text-ink-muted">{t('step1Help')}</p>
      <Card className="p-0">
        <ul>
          {plan.classes.map((c) => (
            <li
              key={c.id}
              className="flex flex-wrap items-center gap-3 border-b border-line px-4 py-3 last:border-b-0"
            >
              <span className="flex min-w-32 flex-col">
                <span className="text-body-strong">{c.name}</span>
                <span className="text-caption text-ink-muted">
                  {t('studentsCount', { count: c.students })}
                  {c.homeroom ? ` · ${c.homeroom}` : ''}
                </span>
              </span>
              <ArrowRight aria-hidden="true" className="size-4 text-ink-muted" />
              {c.successor ? (
                <Chip tone="ok" icon={Check}>
                  {t('created', { name: c.successor.name })}
                </Chip>
              ) : (
                <>
                  <Input
                    label={t('successorFor', { name: c.name })}
                    hideLabel
                    value={names[c.id] ?? ''}
                    placeholder={t('graduates')}
                    onChange={(e) => setNames({ ...names, [c.id]: e.target.value })}
                    fieldClassName="w-32"
                  />
                  {names[c.id]?.trim() ? (
                    c.homeroom ? (
                      <Checkbox
                        label={t('takeHomeroom')}
                        checked={homeroom[c.id] ?? true}
                        onChange={(e) => setHomeroom({ ...homeroom, [c.id]: e.target.checked })}
                      />
                    ) : null
                  ) : (
                    <span className="text-body-sm text-ink-muted">{t('graduatesHint')}</span>
                  )}
                </>
              )}
            </li>
          ))}
        </ul>
      </Card>
      {open.length ? (
        <>
          <Input
            label={t('newClasses')}
            hint={t('newClassesHint')}
            value={fresh}
            onChange={(e) => setFresh(e.target.value)}
          />
          {save.error ? <FormError message={problem(save.error) ?? tc('error')} /> : null}
          <Button
            className="self-start"
            loading={save.isPending}
            onClick={() =>
              save.mutate(
                {
                  toYearId: plan.toYear.id,
                  items: open.map((c) => ({
                    fromClassId: c.id,
                    name: names[c.id]?.trim() || null,
                    takeHomeroom: homeroom[c.id] ?? true,
                  })),
                  newClasses: fresh
                    .split(',')
                    .map((s) => s.trim())
                    .filter(Boolean),
                },
                { onSuccess: (r) => toast({ text: t('classesCreated', { count: r.created }) }) },
              )
            }
          >
            {t('createClasses')}
          </Button>
        </>
      ) : (
        <p className="text-body-sm text-ink-muted">
          {t('targetClasses', { list: plan.targetClasses.map((c) => c.name).join(', ') })}
        </p>
      )}
    </section>
  );
}

// ───────────── 2. Entscheidungen ─────────────

function DecisionsStep({ plan }: { plan: TransitionPlan }) {
  const t = useT('transition');
  const final = (level: number | null) => plan.maxLevel !== null && level === plan.maxLevel;
  return (
    <section aria-labelledby="step2-h" className="flex flex-col gap-3">
      <h2 id="step2-h" className="text-h2">
        {t('step2')}
      </h2>
      <p className="text-body-sm text-ink-muted">{t('step2Help')}</p>
      <Card className="p-0">
        <ul>
          {plan.classes.map((c) => (
            <li key={c.id} className="border-b border-line last:border-b-0">
              <Link
                href={`/klasse/${c.id}/aufstieg`}
                className="pf-focusable flex min-h-13 flex-wrap items-center gap-2 px-4 py-2 hover:bg-brand-soft"
              >
                <span className="w-16 text-body-strong">{c.name}</span>
                <Chip tone="ok">
                  {final(c.level)
                    ? t('count_GRADUATE', { count: c.counts.PROMOTE })
                    : t('count_PROMOTE', { count: c.counts.PROMOTE })}
                </Chip>
                {c.counts.REPEAT ? (
                  <Chip tone="late">{t('count_REPEAT', { count: c.counts.REPEAT })}</Chip>
                ) : null}
                {c.counts.EXAM ? (
                  <Chip tone="late">{t('count_EXAM', { count: c.counts.EXAM })}</Chip>
                ) : null}
                {c.counts.LEAVE ? (
                  <Chip tone="absent">{t('count_LEAVE', { count: c.counts.LEAVE })}</Chip>
                ) : null}
              </Link>
            </li>
          ))}
        </ul>
      </Card>
    </section>
  );
}

// ───────────── 3. Übernehmen ─────────────

function StudentsStep({ plan, queryKey }: { plan: TransitionPlan; queryKey: unknown[] }) {
  const t = useT('transition');
  const tc = useT('common');
  const problem = useProblemText();
  const toast = useToast();
  const [targets, setTargets] = useState<Record<string, string>>({});
  const apply = useApiMutation<Record<string, unknown>, { moved: number; total: number }>(
    'POST',
    () => '/admin/year-transition/students',
    [queryKey],
  );
  const todo = plan.students.filter((s) => !s.done);
  // Schritt 3 erst, wenn jede Klasse eine Folgeklasse hat oder abschließt (sonst fehlen fast alle Ziele)
  const classesReady = plan.classes.every(
    (c) => c.successor || (plan.maxLevel !== null && c.level === plan.maxLevel),
  );
  const final = (cls: string) => plan.maxLevel !== null && levelOf(cls) === plan.maxLevel;
  const missing = todo.filter(
    (s) => !s.target && s.decision !== 'LEAVE' && !(s.decision === 'PROMOTE' && final(s.fromClass)),
  );
  const leaving = todo.filter((s) => !s.target && !missing.includes(s)).length;
  const blocked = missing.some((s) => !targets[s.studentId]);
  const missingFromServer =
    apply.error instanceof ApiError && Array.isArray(apply.error.problem.missing);

  return (
    <section aria-labelledby="step3-h" className="flex flex-col gap-3">
      <h2 id="step3-h" className="text-h2">
        {t('step3')}
      </h2>
      {!classesReady ? (
        <Banner tone="brand" icon={TriangleAlert}>
          {t('classesFirst')}
        </Banner>
      ) : todo.length === 0 ? (
        <Banner tone="brand" icon={Check}>
          {plan.students.length ? t('allDone') : t('nobody')}
        </Banner>
      ) : (
        <>
          <p className="text-body-sm text-ink-muted">
            {t('step3Help', {
              moved: todo.length - leaving - missing.length,
              leaving,
              end: shortDate(plan.fromYear.endsOn),
              start: shortDate(plan.toYear.startsOn),
            })}
          </p>
          {missing.length ? (
            <Card className="flex flex-col gap-3">
              <p className="flex items-center gap-2 text-body-strong">
                <TriangleAlert aria-hidden="true" className="size-5 text-signal-ink" />
                {t('missingTitle', { count: missing.length })}
              </p>
              {missing.map((s) => (
                <Select
                  key={s.studentId}
                  label={`${s.name} (${s.fromClass}, ${t(`decision_${s.decision}`)})`}
                  value={targets[s.studentId] ?? ''}
                  emptyLabel={t('chooseClass')}
                  onChange={(e) => setTargets({ ...targets, [s.studentId]: e.target.value })}
                  options={plan.targetClasses.map((c) => ({ value: c.id, label: c.name }))}
                />
              ))}
            </Card>
          ) : null}
          {apply.error && !missingFromServer ? (
            <FormError message={problem(apply.error) ?? tc('error')} />
          ) : null}
          <Button
            className="self-start"
            disabled={blocked}
            loading={apply.isPending}
            onClick={() =>
              apply.mutate(
                { toYearId: plan.toYear.id, targets },
                {
                  onSuccess: (r) =>
                    toast({ text: t('appliedToast', { moved: r.moved, total: r.total }) }),
                },
              )
            }
          >
            {t('apply')}
          </Button>
        </>
      )}
      <Card flat className="flex flex-col gap-2">
        <h3 className="text-h3">{t('afterTitle')}</h3>
        <ul className="flex list-disc flex-col gap-1 pl-5 text-body-sm">
          <li>
            <Link className="text-brand-text underline" href="/admin/personen?kind=TEACHER">
              {t('afterTeachers')}
            </Link>
          </li>
          <li>
            <Link className="text-brand-text underline" href="/admin/stundenplan">
              {t('afterTimetable', { year: plan.toYear.name })}
            </Link>
          </li>
          <li>
            <Link className="text-brand-text underline" href="/admin/schuljahr">
              {t('afterActivate', { start: shortDate(plan.toYear.startsOn) })}
            </Link>
          </li>
        </ul>
      </Card>
    </section>
  );
}
