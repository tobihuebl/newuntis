import { notFound } from 'next/navigation';
import { PersonDetail, type PersonData } from '../../../../../src/components/admin/person-detail';
import { adminPage } from '../../../../../src/lib/admin';
import { apiFetch, apiGet } from '../../../../../src/lib/api-server';

export default async function PersonPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { me, csrfToken, readOnly } = await adminPage(`/admin/personen/${id}`);
  const res = await apiFetch(`/admin/persons/${encodeURIComponent(id)}`);
  if (res.status === 404) notFound();
  if (!res.ok) throw new Error(`API: ${res.status}`);
  const person = (await res.json()) as PersonData;
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
    <PersonDetail
      person={person}
      classes={classes.map((c) => ({ value: c.id, label: c.name }))}
      csrfToken={csrfToken}
      readOnly={readOnly}
      currentPersonId={me.user.personId}
    />
  );
}
