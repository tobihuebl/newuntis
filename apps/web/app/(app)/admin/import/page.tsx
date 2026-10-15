import Link from 'next/link';
import { redirect } from 'next/navigation';
import { SegmentedNav } from '@sp/ui';
import { ImportWizard } from '../../../../src/components/admin/import-wizard';
import { UntisImport } from '../../../../src/components/admin/untis-import';
import { adminPage } from '../../../../src/lib/admin';
import { getT } from '../../../../src/lib/nav-server';

/** Import: Personen per CSV (SD-03) oder Stundenplan aus Untis (SD-06, ADR 0023). */
export default async function ImportPage({
  searchParams,
}: {
  searchParams: Promise<{ art?: string }>;
}) {
  const { csrfToken, readOnly } = await adminPage('/admin/import');
  if (readOnly) redirect('/');
  const untis = (await searchParams).art === 'untis';
  const t = await getT('admin.untis');
  const nav = (
    <SegmentedNav
      label={t('kind')}
      linkAs={Link}
      items={[
        { key: 'persons', href: '/admin/import', label: t('kindPersons'), current: !untis },
        { key: 'untis', href: '/admin/import?art=untis', label: t('kindUntis'), current: untis },
      ]}
    />
  );
  return untis ? (
    <UntisImport csrfToken={csrfToken} nav={nav} />
  ) : (
    <ImportWizard csrfToken={csrfToken} nav={nav} />
  );
}
