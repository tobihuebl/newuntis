'use client';
import { ArrowRight, Check, Circle, MonitorSmartphone, TriangleAlert } from 'lucide-react';
import Link from 'next/link';
import type { OnboardingFlowStats, Role } from '@sp/shared';
import { Banner, Button, Card, CardSub, CardTitle, Chip, Skeleton, cn } from '@sp/ui';
import { useApi } from '../../lib/use-api';
import { useT } from '../../lib/i18n';

interface ListOf<T> {
  data: T[];
}

type Step = 'schoolYear' | 'periods' | 'masterdata' | 'persons' | 'access' | 'timetable';
const HREF: Record<Step, string> = {
  schoolYear: '/admin/schuljahr',
  periods: '/admin/raster',
  masterdata: '/admin/klassen',
  persons: '/admin/import',
  access: '/admin/rollen',
  timetable: '/admin/stundenplan',
};

/**
 * Übersicht der Administration: Fortschritt als Kachel-Leiste (erledigt Kobalt, offen bg-sunken) und je Schritt
 * eine Zeile mit Status-Chip und Weg zur Seite. Stand aus vorhandenen Abfragen, kein eigener Endpunkt.
 */
export function OverviewScreen() {
  const t = useT('adminOverview');
  const years = useApi<ListOf<{ freeDayCount?: number }>>(
    ['admin', 'school-years'],
    '/admin/school-years',
  );
  const periods = useApi<ListOf<unknown>>(['admin', 'periods'], '/admin/periods');
  const classes = useApi<ListOf<unknown>>(['admin', 'classes'], '/admin/classes');
  const subjects = useApi<ListOf<unknown>>(['admin', 'subjects'], '/admin/subjects');
  const rooms = useApi<ListOf<unknown>>(['admin', 'rooms'], '/admin/rooms');
  const roles = useApi<{ counts: Partial<Record<Role, number>> }>(
    ['admin', 'roles'],
    '/admin/roles',
  );
  const versions = useApi<ListOf<{ status: string }>>(
    ['admin', 'timetable-versions'],
    '/admin/timetable-versions',
  );
  const queries = [years, periods, classes, subjects, rooms, roles, versions];
  const loading = queries.some((q) => q.isPending);
  const failed = queries.some((q) => q.isError);

  const has = (q: { data?: ListOf<unknown> }) => (q.data?.data.length ?? 0) > 0;
  const counts = roles.data?.counts ?? {};
  const done: Record<Step, boolean> = {
    schoolYear: (years.data?.data ?? []).some((y) => (y.freeDayCount ?? 0) > 0),
    periods: has(periods),
    masterdata: has(classes) && has(subjects) && has(rooms),
    persons: (counts.STUDENT ?? 0) > 0,
    access: (counts.PRINCIPAL ?? 0) > 0 && (counts.TEACHER ?? 0) > 0,
    timetable: (versions.data?.data ?? []).some((v) => v.status === 'PUBLISHED'),
  };
  const steps = Object.keys(HREF) as Step[];
  const doneCount = steps.filter((s) => done[s]).length;
  // Stepper: der erste offene Schritt ist "Als Nächstes" (Onboarding der Administration, ADR 0020)
  const nextStep = steps.find((s) => !done[s]);

  return (
    <div className="mx-auto flex max-w-(--content-max) flex-col gap-8 px-4 py-6 lg:px-6">
      <header className="flex flex-col gap-2">
        <p className="text-overline text-brand-text">{t('overline')}</p>
        <h1 className="text-h1">{t('title')}</h1>
        <p className="text-body-sm text-ink-muted">{t('intro')}</p>
      </header>

      {/* Onboarding: Einrichtung am Computer, am Handy nur Stand und Freigaben */}
      {!loading && doneCount < steps.length ? (
        <Banner tone="brand" icon={MonitorSmartphone} className="lg:hidden">
          {t('mobileHint')}
        </Banner>
      ) : null}

      {failed ? (
        <Banner
          tone="danger"
          icon={TriangleAlert}
          action={
            <Button
              size="sm"
              variant="secondary"
              onClick={() => queries.forEach((q) => void q.refetch())}
            >
              {t('retry')}
            </Button>
          }
        >
          {t('error')}
        </Banner>
      ) : null}

      <section aria-labelledby="setup" className="flex flex-col gap-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 id="setup" className="text-h2">
            {t('setupTitle')}
          </h2>
          {loading ? null : (
            <p className="text-label text-ink-muted">
              {t('progress', { done: doneCount, total: steps.length })}
            </p>
          )}
        </div>
        <div className="grid grid-cols-6 gap-2" aria-hidden="true">
          {steps.map((s) => (
            <span
              key={s}
              className={cn('h-3 rounded-xs', !loading && done[s] ? 'bg-brand' : 'bg-bg-sunken')}
            />
          ))}
        </div>
        <ol className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {steps.map((s) => (
            <li key={s}>
              {loading ? (
                <Skeleton className="h-36 rounded-lg" />
              ) : (
                <Card interactive asChild className="flex h-full flex-col gap-3">
                  <Link href={HREF[s]}>
                    <div className="flex items-start justify-between gap-3">
                      <CardTitle as="h3">{t(`items.${s}.title`)}</CardTitle>
                      {done[s] ? (
                        <Chip tone="ok" icon={Check}>
                          {t('done')}
                        </Chip>
                      ) : s === nextStep ? (
                        <Chip tone="late" icon={ArrowRight}>
                          {t('next')}
                        </Chip>
                      ) : (
                        <Chip tone="absent" icon={Circle}>
                          {t('open')}
                        </Chip>
                      )}
                    </div>
                    <CardSub className="mt-0 flex-1">{t(`items.${s}.text`)}</CardSub>
                    <ArrowRight aria-hidden="true" className="size-5 self-end text-brand-text" />
                  </Link>
                </Card>
              )}
            </li>
          ))}
        </ol>
      </section>

      <OnboardingStats />
    </div>
  );
}

/** Auswertung des Onboardings (ADR 0020): je Rolle begonnen, am Ziel, Median bis zum Aha-Moment, Absprünge je Schritt. */
function OnboardingStats() {
  const t = useT('adminOverview');
  const to = useT('onboarding');
  const q = useApi<{ data: OnboardingFlowStats[] }>(
    ['admin', 'onboarding'],
    '/admin/onboarding/stats',
  );
  const flows = (q.data?.data ?? []).filter((f) => f.started > 0);
  if (flows.length === 0) return null;
  return (
    <section aria-labelledby="ob-stats" className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 id="ob-stats" className="text-h2">
          {t('statsTitle')}
        </h2>
        <p className="text-body-sm text-ink-muted">{t('statsIntro')}</p>
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {flows.map((f) => (
          <Card key={f.flow} className="flex flex-col gap-3">
            <CardTitle as="h3">{t(`flow_${f.flow}`)}</CardTitle>
            <p className="flex flex-wrap gap-2">
              <Chip tone="ok">{t('statsStarted', { count: f.started })}</Chip>
              <Chip tone="ok">{t('statsAha', { count: f.reachedAha })}</Chip>
            </p>
            <p className="text-body-sm text-ink-muted">
              {f.medianHoursToAha === null
                ? t('statsNoMedian')
                : t('statsMedian', { hours: f.medianHoursToAha.toLocaleString('de-AT') })}
            </p>
            <table className="w-full text-body-sm">
              <thead>
                <tr className="text-left text-caption text-ink-muted">
                  <th scope="col" className="py-1">
                    {t('statsStep')}
                  </th>
                  <th scope="col" className="py-1 text-right">
                    {t('statsViewed')}
                  </th>
                  <th scope="col" className="py-1 text-right">
                    {t('statsDone')}
                  </th>
                  <th scope="col" className="py-1 text-right">
                    {t('statsSkipped')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {f.steps.map((s) => (
                  <tr key={s.stepId} className="border-t border-line">
                    <th scope="row" className="py-1 text-left">
                      {to(`title_${s.stepId}`)}
                    </th>
                    <td className="py-1 text-right text-mono-sm">{s.viewed}</td>
                    <td className="py-1 text-right text-mono-sm">{s.done}</td>
                    <td className="py-1 text-right text-mono-sm">{s.skipped}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        ))}
      </div>
    </section>
  );
}
