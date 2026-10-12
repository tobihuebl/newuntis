'use client';
import { ArrowRight, Check, Circle, TriangleAlert } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import type { Role } from '@sp/shared';
import { Banner, Button, Card, CardSub, CardTitle, Chip, Skeleton, cn } from '@sp/ui';
import { useApi } from '../../lib/use-api';

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
  const t = useTranslations('adminOverview');
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

  return (
    <div className="mx-auto flex max-w-(--content-max) flex-col gap-8 px-4 py-6 lg:px-6">
      <header className="flex flex-col gap-2">
        <p className="text-overline text-brand-text">{t('overline')}</p>
        <h1 className="text-h1">{t('title')}</h1>
        <p className="text-body-sm text-ink-muted">{t('intro')}</p>
      </header>

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
        <ol className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
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
    </div>
  );
}
