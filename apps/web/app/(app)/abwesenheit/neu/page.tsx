import { Suspense } from 'react';
import { AbsenceForm } from '../../../../src/components/absences/absence-form';
import { requireRoute } from '../../../../src/lib/route-guard';
import { getT } from '../../../../src/lib/nav-server';

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
    <div className="mx-auto flex max-w-xl flex-col gap-4 p-4">
      <h1 className="text-h1">{t('title')}</h1>
      <Suspense>
        <AbsenceForm mode={mode} selfId={me.user.personId} />
      </Suspense>
    </div>
  );
}
