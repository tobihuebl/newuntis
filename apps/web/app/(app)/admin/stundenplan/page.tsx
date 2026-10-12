import { redirect } from 'next/navigation';
import { can } from '@sp/shared';
import { VersionsList, type VersionRow } from '../../../../src/components/timetable/versions-list';
import { apiGet } from '../../../../src/lib/api-server';
import { requireRoute } from '../../../../src/lib/route-guard';

export default async function TimetableVersionsPage() {
  const me = await requireRoute('/admin/stundenplan');
  const user = { personId: me.user.personId, roles: me.user.roles.map((r) => r.role) };
  if (!can(user, 'timetable.publish')) redirect('/');
  const [versions, years] = await Promise.all([
    apiGet<{ data: VersionRow[] }>('/admin/timetable-versions'),
    apiGet<{ data: { id: string; isCurrent: boolean }[] }>('/admin/school-years'),
  ]);
  const current = years.data.find((y) => y.isCurrent);
  return (
    <VersionsList
      rows={versions.data}
      schoolYearId={current?.id ?? null}
      csrfToken={me.csrfToken}
      canEdit={can(user, 'timetable.edit')}
    />
  );
}
