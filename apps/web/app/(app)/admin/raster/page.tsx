import { PeriodsManager, type PeriodRow } from '../../../../src/components/admin/managers';
import { adminPage } from '../../../../src/lib/admin';
import { apiGet } from '../../../../src/lib/api-server';

export default async function PeriodsPage() {
  const { csrfToken, readOnly } = await adminPage('/admin/raster');
  const { data } = await apiGet<{ data: PeriodRow[] }>('/admin/periods');
  return <PeriodsManager rows={data} csrfToken={csrfToken} readOnly={readOnly} />;
}
