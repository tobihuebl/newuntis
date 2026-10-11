import { redirect } from 'next/navigation';
import { ImportWizard } from '../../../../src/components/admin/import-wizard';
import { adminPage } from '../../../../src/lib/admin';

export default async function ImportPage() {
  const { csrfToken, readOnly } = await adminPage('/admin/import');
  if (readOnly) redirect('/');
  return <ImportWizard csrfToken={csrfToken} />;
}
