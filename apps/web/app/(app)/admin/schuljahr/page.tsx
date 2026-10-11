import {
  FreeDaysManager,
  YearsManager,
  type FreeDayRow,
  type YearRow,
} from '../../../../src/components/admin/managers';
import { adminPage } from '../../../../src/lib/admin';
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
    </>
  );
}
