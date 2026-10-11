import { PersonsList } from '../../../../src/components/admin/persons-list';
import { adminPage } from '../../../../src/lib/admin';
import { apiGet } from '../../../../src/lib/api-server';

export default async function PersonsPage() {
  const { csrfToken, readOnly } = await adminPage('/admin/personen');
  const years = (
    await apiGet<{ data: { id: string; isCurrent: boolean }[] }>('/admin/school-years')
  ).data;
  const current = years.find((y) => y.isCurrent);
  const classes = current
    ? (
        await apiGet<{ data: { id: string; name: string }[] }>(
          `/admin/classes?schoolYearId=${current.id}`,
        )
      ).data
    : [];
  return (
    <PersonsList
      classes={classes.map((c) => ({ value: c.id, label: c.name }))}
      csrfToken={csrfToken}
      readOnly={readOnly}
    />
  );
}
