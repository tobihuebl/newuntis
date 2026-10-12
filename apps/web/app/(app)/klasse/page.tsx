import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Card, EmptyState } from '@sp/ui';
import { apiGet } from '../../../src/lib/api-server';
import { requireRoute } from '../../../src/lib/route-guard';
import { getT } from '../../../src/lib/nav-server';
import { PageTitle } from '../../../src/components/page-title';

/** "Meine Klasse": Klassenvorstand direkt zur eigenen Klasse, Direktion und Administration wählen. */
export default async function KlassePage() {
  const me = await requireRoute('/klasse');
  const t = await getT('klasse');
  const roles = me.user.roles.map((r) => r.role);
  const own = me.user.roles.flatMap((r) => (r.role === 'HOMEROOM' && r.classId ? [r.classId] : []));
  const manager = roles.includes('PRINCIPAL') || roles.includes('ADMIN');
  if (!manager && own.length === 1) redirect(`/klasse/${own[0]}/entschuldigungen`);
  const directory = await apiGet<{ classes: { id: string; name: string }[] }>(
    '/timetable/directory',
  );
  const classes = manager ? directory.classes : directory.classes.filter((c) => own.includes(c.id));
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 pt-4 pb-8 lg:px-6 lg:pt-6">
      <PageTitle area="klassenvorstand">{t('choose')}</PageTitle>
      {classes.length === 0 ? (
        <Card>
          <EmptyState title={t('noClass')} />
        </Card>
      ) : (
        <Card className="p-0">
          <ul>
            {classes.map((c) => (
              <li key={c.id} className="border-b border-line last:border-b-0">
                <Link
                  href={`/klasse/${c.id}/entschuldigungen`}
                  className="flex min-h-12 items-center px-4 hover:bg-bg-sunken"
                >
                  {c.name}
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
