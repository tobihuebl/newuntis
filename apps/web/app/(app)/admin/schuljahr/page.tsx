import {
  FreeDaysManager,
  YearsManager,
  type FreeDayRow,
  type YearRow,
} from '../../../../src/components/admin/managers';
import Link from 'next/link';
import { CalendarClock } from 'lucide-react';
import { Button, Card } from '@sp/ui';
import { adminPage } from '../../../../src/lib/admin';
import { getT } from '../../../../src/lib/nav-server';
import { apiGet } from '../../../../src/lib/api-server';

export default async function SchoolYearPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string }>;
}) {
  const { csrfToken, readOnly } = await adminPage('/admin/schuljahr');
  const { year } = await searchParams;
  const { data } = await apiGet<{ data: YearRow[] }>('/admin/school-years');
  const selected =
    data.find((y) => y.id === year) ?? data.find((y) => y.isCurrent) ?? data[0] ?? null;
  const t = await getT('transition');
  const current = data.find((y) => y.isCurrent);
  const next = current ? data.find((y) => y.startsOn > current.startsOn) : undefined;
  const detail = selected
    ? await apiGet<{ freeDays: FreeDayRow[] }>(`/admin/school-years/${selected.id}`)
    : null;
  return (
    <>
      <YearsManager
        rows={data}
        selectedId={selected?.id ?? null}
        csrfToken={csrfToken}
        readOnly={readOnly}
      />
      {selected && detail ? (
        <FreeDaysManager
          key={selected.id}
          rows={detail.freeDays}
          yearId={selected.id}
          csrfToken={csrfToken}
          readOnly={readOnly}
        />
      ) : null}
      {!readOnly && next ? (
        <div className="mx-auto w-full max-w-4xl px-4 pb-8 lg:px-6">
          <Card className="flex flex-wrap items-center justify-between gap-3">
            <span className="flex flex-col gap-1">
              <span className="text-h3">{t('adminTitle')}</span>
              <span className="text-body-sm text-ink-muted">
                {t('teaser', { from: current!.name, to: next.name })}
              </span>
            </span>
            <Button asChild iconLeft={CalendarClock}>
              <Link href="/admin/schuljahreswechsel">{t('teaserAction')}</Link>
            </Button>
          </Card>
        </div>
      ) : null}
    </>
  );
}
