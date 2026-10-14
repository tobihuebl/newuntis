'use client';
import { Info, PenLine, RefreshCw, Sparkles, TriangleAlert } from 'lucide-react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import type { CoverageRow, PlanningRunItem, PlanningScope } from '@sp/shared';
import {
  Banner,
  Button,
  Card,
  CardTitle,
  ChoiceChips,
  Chip,
  EmptyState,
  KpiTile,
  SegmentedControl,
  Skeleton,
  cn,
} from '@sp/ui';
import { apiRequest } from '../../lib/api-client';
import { dateTimeOf } from '../../lib/dates';
import { useApi, useApiMutation, useProblemText } from '../../lib/use-api';
import { useT } from '../../lib/i18n';
import { FormError } from '../form-bits';
import { LoadError } from '../load-error';
import { PageTitle } from '../page-title';
import { PlanPreview, type PreviewData } from './plan-preview';
import { RequirementsCard, type VersionOption } from './requirements-card';
import { WishesCard } from './wishes-card';

type Detail = PreviewData & {
  version: { id: string; schoolYear: { id: string; name: string }; status: string };
  requirements: { id: string; hoursPerWeek: number }[];
  coverage?: CoverageRow[];
};

const STEPS = ['input', 'proposal', 'check', 'polish', 'release'] as const;

/** Fünf Schritte als Kachel-Leiste (Design System, AI-Planung); aktueller Schritt Kobalt. */
function StepBar({ at }: { at: number }) {
  const t = useT('assistant');
  return (
    <div className="flex flex-col gap-2">
      <ol className="grid grid-cols-5 gap-2" aria-label={t('steps')}>
        {STEPS.map((s, i) => (
          <li
            key={s}
            aria-current={i === at ? 'step' : undefined}
            className={cn(
              'flex min-h-11 flex-col justify-end rounded-md p-2 text-caption sm:min-h-14',
              i <= at ? 'bg-brand text-on-brand' : 'bg-bg-sunken text-ink-muted',
            )}
          >
            <span className="text-mono-sm">{i + 1}</span>
            {/* Mobil nur Nummern, die Beschriftung des aktuellen Schritts steht darunter */}
            <span className="max-sm:sr-only">{t(`step_${s}`)}</span>
          </li>
        ))}
      </ol>
      <p className="text-label text-ink-muted sm:hidden" aria-hidden="true">
        {t('stepOf', { n: at + 1, total: STEPS.length, name: t(`step_${STEPS[at]}`) })}
      </p>
    </div>
  );
}

/**
 * Stundenplan-Assistent (M7, SP-08; Design System "AI-Planung"): Eingabe (Lehrfächerverteilung, Wünsche,
 * Umfang), Vorschlag als neuer Entwurf, Regelprüfung als Zahlen, Feinschliff und Freigabe im Editor.
 */
export function AssistantScreen({ initialVersionId }: { initialVersionId: string | null }) {
  const t = useT('assistant');
  const problem = useProblemText();
  const status = useApi<{ enabled: boolean; ai: boolean }>(
    ['planning', 'status'],
    '/admin/planning/status',
  );
  const versions = useApi<{ data: VersionOption[] }>(
    ['timetable-versions'],
    '/admin/timetable-versions',
  );
  const list = versions.data?.data ?? [];
  const fallback =
    list.find((v) => v.status === 'DRAFT') ?? list.find((v) => v.status === 'PUBLISHED') ?? list[0];
  const [versionId, setVersionId] = useState<string | null>(initialVersionId);
  useEffect(() => {
    if (!versionId && fallback) setVersionId(fallback.id);
  }, [versionId, fallback]);
  const source = useApi<Detail>(
    ['timetable-version', versionId],
    versionId ? `/admin/timetable-versions/${versionId}` : null,
  );
  const yearId = source.data?.version.schoolYear.id ?? null;
  // Läufe laufen über die Job-Queue: nachfragen, solange einer wartet oder rechnet
  const runs = useQuery({
    queryKey: ['planning', 'runs', yearId],
    queryFn: () =>
      apiRequest<{ data: PlanningRunItem[] }>('GET', `/admin/planning/runs?schoolYearId=${yearId}`),
    enabled: !!yearId && !!status.data?.enabled,
    refetchInterval: (q) =>
      q.state.data?.data.some((r) => r.status === 'QUEUED' || r.status === 'RUNNING')
        ? 1000
        : false,
  });
  const [selectedRun, setSelectedRun] = useState<string | null>(null);
  const run = runs.data?.data.find((r) => r.id === selectedRun) ?? runs.data?.data[0] ?? null;
  const result = useApi<Detail>(
    ['timetable-version', run?.resultVersionId],
    run?.resultVersionId ? `/admin/timetable-versions/${run.resultVersionId}` : null,
  );

  const [scopeKind, setScopeKind] = useState<PlanningScope['kind']>('all');
  const [scopeIds, setScopeIds] = useState<string[]>([]);
  const start = useApiMutation<
    { sourceVersionId: string; scope: PlanningScope; seed?: number },
    PlanningRunItem
  >('POST', () => '/admin/planning/runs', [['planning', 'runs', yearId]]);
  const hours = useMemo(
    () => (source.data?.requirements ?? []).reduce((a, r) => a + r.hoursPerWeek, 0),
    [source.data],
  );

  async function propose(seed?: number) {
    if (!versionId) return;
    const scope: PlanningScope =
      scopeKind === 'all' ? { kind: 'all' } : { kind: scopeKind, ids: scopeIds };
    const r = await start.mutateAsync({
      sourceVersionId: versionId,
      scope,
      ...(seed ? { seed } : {}),
    });
    setSelectedRun(r.id);
  }

  if (status.isError)
    return (
      <Shell>
        <LoadError error={status.error} onRetry={() => void status.refetch()} />
      </Shell>
    );
  if (!status.data || versions.isPending)
    return (
      <Shell>
        <Skeleton className="h-64 w-full rounded-lg" />
      </Shell>
    );
  if (!status.data.enabled)
    return (
      <Shell>
        <Card flat>
          <EmptyState title={t('disabledTitle')} description={t('disabledText')} />
        </Card>
      </Shell>
    );

  const at = run?.status === 'DONE' ? 2 : 0;
  const canStart =
    !!versionId &&
    (source.data?.requirements.length ?? 0) > 0 &&
    (scopeKind === 'all' || scopeIds.length > 0);

  return (
    <Shell>
      <StepBar at={at} />
      <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-2">
        <div className="flex min-w-0 flex-col gap-6">
          {versionId ? (
            <RequirementsCard
              versions={list}
              versionId={versionId}
              onVersion={(id) => {
                setVersionId(id);
                setSelectedRun(null);
              }}
              requirementCount={source.data?.requirements.length ?? 0}
              hours={hours}
              onImported={() => void source.refetch()}
            />
          ) : (
            <Card flat>
              <EmptyState title={t('noVersion')} description={t('noVersionText')} />
            </Card>
          )}
          {yearId ? <WishesCard schoolYearId={yearId} ai={status.data.ai} /> : null}
        </div>

        <div className="flex min-w-0 flex-col gap-6">
          <Card className="flex flex-col gap-4">
            <CardTitle as="h2">{t('scope')}</CardTitle>
            <SegmentedControl
              label={t('scopeLabel')}
              hideLabel
              value={scopeKind}
              onChange={(v) => {
                setScopeKind(v);
                setScopeIds([]);
              }}
              options={[
                { value: 'all', label: t('scope_all') },
                { value: 'classes', label: t('scope_classes') },
                { value: 'teachers', label: t('scope_teachers') },
              ]}
            />
            {scopeKind !== 'all' && source.data ? (
              <ChoiceChips
                label={scopeKind === 'classes' ? t('pickClasses') : t('pickTeachers')}
                options={
                  scopeKind === 'classes'
                    ? source.data.classes.map((c) => ({ value: c.id, label: c.name }))
                    : source.data.teachers.map((x) => ({
                        value: x.id,
                        label: `${x.firstName} ${x.lastName}`,
                      }))
                }
                value={scopeIds}
                onChange={setScopeIds}
              />
            ) : null}
            <p className="flex items-start gap-2 text-body-sm text-ink-muted">
              <Info aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
              {scopeKind === 'all' ? t('scopeAllHint') : t('scopePartHint')}
            </p>
            {start.error ? <FormError message={problem(start.error)} /> : null}
            <Button
              iconLeft={Sparkles}
              loading={start.isPending}
              disabled={!canStart}
              onClick={() => void propose()}
              className="self-start"
            >
              {t('propose')}
            </Button>
          </Card>

          <RunResult
            run={run}
            result={result.data ?? null}
            busy={start.isPending}
            onAgain={() => void propose(Math.floor(Math.random() * 2_000_000_000) + 1)}
          />

          {runs.data && runs.data.data.length > 1 ? (
            <Card className="flex flex-col gap-3">
              <CardTitle as="h2">{t('history')}</CardTitle>
              <ul className="flex flex-col divide-y divide-line">
                {runs.data.data.map((r) => (
                  <li key={r.id} className="flex flex-wrap items-center gap-2 py-2">
                    <button
                      type="button"
                      onClick={() => setSelectedRun(r.id)}
                      aria-current={r.id === run?.id ? 'true' : undefined}
                      className="pf-focusable min-h-11 flex-1 text-left text-body-sm"
                    >
                      <span className="text-mono-sm text-ink-muted">{dateTimeOf(r.createdAt)}</span>{' '}
                      {t(`scope_${r.scope.kind}`)} · {t('seed', { seed: r.seed })}
                    </button>
                    {r.stats ? (
                      <Chip tone={r.stats.hard === 0 ? 'ok' : 'danger'}>
                        {t('hardShort', { count: r.stats.hard })}
                      </Chip>
                    ) : (
                      <Chip tone="absent">{t(`run_${r.status}`)}</Chip>
                    )}
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}
        </div>
      </div>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  const t = useT('assistant');
  return (
    <div className="mx-auto flex w-full max-w-(--content-max) flex-col gap-6 px-4 pt-4 pb-8 lg:px-6 lg:pt-6">
      <div className="flex flex-col gap-2">
        <PageTitle area="stundenplan">{t('title')}</PageTitle>
        <p className="text-body-lg text-ink-muted">{t('claim')}</p>
      </div>
      {children}
    </div>
  );
}

/** Ergebnis eines Laufs: Entwurf, Bewertung als einfache Zahlen, nicht einplanbare Stunden, Vorschau. */
function RunResult({
  run,
  result,
  busy,
  onAgain,
}: {
  run: PlanningRunItem | null;
  result: Detail | null;
  busy: boolean;
  onAgain: () => void;
}) {
  const t = useT('assistant');
  if (!run)
    return (
      <Card flat>
        <EmptyState as="h2" title={t('noRun')} description={t('noRunText')} />
      </Card>
    );
  if (run.status === 'QUEUED' || run.status === 'RUNNING')
    return (
      <Banner tone="brand" icon={RefreshCw}>
        {t('running')}
      </Banner>
    );
  if (run.status === 'FAILED' || !run.stats)
    return (
      <Banner tone="danger" icon={TriangleAlert}>
        {run.error ?? t('failed')}
      </Banner>
    );
  const s = run.stats;
  const gapsStudents = s.soft.GAP_STUDENT ?? 0;
  const gapsTeachers = s.soft.GAP_TEACHER ?? 0;
  const other =
    (s.soft.DAY_LOAD ?? 0) + (s.soft.SAME_SUBJECT_TWICE ?? 0) + (s.soft.WISH_VIOLATED ?? 0);
  return (
    <section aria-labelledby="result-h" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="result-h" className="text-h2">
          {t('result')}
        </h2>
        <Chip tone="absent">{t('draft')}</Chip>
      </div>
      <p className="text-body-sm text-ink-muted">
        {t('resultSummary', { planned: s.planned, required: s.required, ms: s.ms, seed: run.seed })}
      </p>
      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <li>
          <KpiTile
            value={s.hard}
            label={t('kpiHard', { count: s.hard })}
            tone={s.hard ? 'signal' : 'brand'}
            className="h-full"
          />
        </li>
        <li>
          <KpiTile
            value={gapsStudents}
            label={t('kpiGapsStudents', { count: gapsStudents })}
            tone={gapsStudents ? 'signal' : 'brand'}
            className="h-full"
          />
        </li>
        <li>
          <KpiTile
            value={gapsTeachers}
            label={t('kpiGapsTeachers', { count: gapsTeachers })}
            className="h-full"
          />
        </li>
        <li>
          <KpiTile value={other} label={t('kpiOther')} className="h-full" />
        </li>
      </ul>
      {run.unplaced.length ? (
        <Banner icon={TriangleAlert}>
          <p className="text-body-strong">{t('unplaced', { count: run.unplaced.length })}</p>
          <ul className="list-disc pl-5 text-body-sm">
            {run.unplaced.map((u, i) => (
              <li key={i}>{u.message}</li>
            ))}
          </ul>
        </Banner>
      ) : null}
      {result ? (
        <Card className="flex flex-col gap-3">
          <CardTitle as="h3">{t('preview')}</CardTitle>
          <PlanPreview data={result} />
        </Card>
      ) : null}
      <div className="flex flex-wrap gap-2">
        {run.resultVersionId ? (
          <Button variant="secondary" asChild iconLeft={PenLine}>
            <Link href={`/admin/stundenplan/${run.resultVersionId}`}>{t('polish')}</Link>
          </Button>
        ) : null}
        <Button variant="ghost" iconLeft={RefreshCw} onClick={onAgain} loading={busy}>
          {t('again')}
        </Button>
      </div>
      <p className="text-caption text-ink-muted">{t('releaseHint')}</p>
    </section>
  );
}
