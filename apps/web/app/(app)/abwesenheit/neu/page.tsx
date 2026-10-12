import { Suspense } from 'react';
import { AbsenceForm } from '../../../../src/components/absences/absence-form';
import { requireRoute } from '../../../../src/lib/route-guard';
import { getT } from '../../../../src/lib/nav-server';
import { PageTitle } from '../../../../src/components/page-title';

export default async function AbwesenheitNeuPage() {
  const me = await requireRoute('/abwesenheit/neu');
  const t = await getT('absence');
  const roles = me.user.roles.map((r) => r.role);
  const mode = roles.includes('GUARDIAN')
    ? 'guardian'
    : roles.includes('ADMIN')
      ? 'admin'
      : 'student';
  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-6 px-4 pt-4 pb-8 lg:px-6 lg:pt-6">
      <PageTitle area="familie">{t('title')}</PageTitle>
      <Suspense>
        <AbsenceForm mode={mode} selfId={me.user.personId} />
      </Suspense>
    </div>
  );
}
