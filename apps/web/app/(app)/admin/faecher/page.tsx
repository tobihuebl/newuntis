import { SubjectsManager, type SubjectRow } from '../../../../src/components/admin/managers';
import { adminPage } from '../../../../src/lib/admin';
import { apiGet } from '../../../../src/lib/api-server';

export default async function SubjectsPage() {
  const { csrfToken, readOnly } = await adminPage('/admin/faecher');
  const { data } = await apiGet<{ data: SubjectRow[] }>('/admin/subjects');
  return <SubjectsManager rows={data} csrfToken={csrfToken} readOnly={readOnly} />;
}
