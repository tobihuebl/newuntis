import { getTranslations } from 'next-intl/server';
import { Card } from '@sp/ui';
import {
  ClassesManager,
  GroupsManager,
  type ClassRow,
  type GroupRow,
} from '../../../../src/components/admin/managers';
import { adminPage } from '../../../../src/lib/admin';
import { apiGet } from '../../../../src/lib/api-server';

interface Year {
  id: string;
  isCurrent: boolean;
}
interface PersonRow {
  id: string;
  firstName: string;
  lastName: string;
}

export default async function ClassesPage() {
  const { csrfToken, readOnly } = await adminPage('/admin/klassen');
  const t = await getTranslations('admin.classes');
  const years = (await apiGet<{ data: Year[] }>('/admin/school-years')).data;
  const current = years.find((y) => y.isCurrent);
  if (!current) {
    return (
      <div className="mx-auto max-w-4xl p-4">
        <Card>{t('noYear')}</Card>
      </div>
    );
  }
  const [classes, groups, teachers] = await Promise.all([
    apiGet<{ data: ClassRow[] }>(`/admin/classes?schoolYearId=${current.id}`),
    apiGet<{ data: GroupRow[] }>(`/admin/groups?schoolYearId=${current.id}`),
    apiGet<{ data: PersonRow[] }>('/admin/persons?kind=TEACHER&limit=100'),
  ]);
  const teacherOptions = teachers.data.map((p) => ({
    value: p.id,
    label: `${p.lastName} ${p.firstName}`,
  }));
  return (
    <>
      <ClassesManager
        rows={classes.data}
        teachers={teacherOptions}
        schoolYearId={current.id}
        csrfToken={csrfToken}
        readOnly={readOnly}
      />
      <GroupsManager
        rows={groups.data}
        schoolYearId={current.id}
        csrfToken={csrfToken}
        readOnly={readOnly}
      />
    </>
  );
}
