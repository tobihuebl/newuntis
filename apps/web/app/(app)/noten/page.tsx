import Link from 'next/link';
import { redirect } from 'next/navigation';
import { SegmentedNav } from '@sp/ui';
import { CoursesScreen } from '../../../src/components/grades/courses-screen';
import { MyGrades } from '../../../src/components/grades/my-grades';
import { PageTitle } from '../../../src/components/page-title';
import { apiGet } from '../../../src/lib/api-server';
import { getT, navigationOf } from '../../../src/lib/nav-server';
import { requireRoute } from '../../../src/lib/route-guard';

interface Child {
  id: string;
  firstName: string;
  lastName: string;
  className: string | null;
}

/**
 * Noten (PN-02) je Ansicht: Lehrkräfte ihre Kurse, Schüler:innen die eigenen, Eltern die ihrer Kinder.
 * Direktion und Administration lesen Noten über die Klassenseite.
 */
export default async function NotenPage({
  searchParams,
}: {
  searchParams: Promise<{ child?: string }>;
}) {
  const me = await requireRoute('/noten');
  const { view } = await navigationOf(me);
  if (view === 'TEACHER' || view === 'HOMEROOM') return <CoursesScreen />;
  if (view !== 'STUDENT' && view !== 'GUARDIAN') redirect('/klassen');
  const t = await getT('grades');
  const q = await searchParams;
  let child: Child | undefined;
  let children: Child[] = [];
  if (view === 'GUARDIAN') {
    children = (await apiGet<{ data: Child[] }>('/me/children')).data;
    child = children.find((c) => c.id === q.child) ?? children[0];
  }
  return (
    <div className="mx-auto flex w-full max-w-(--content-max) flex-col gap-6 px-4 pt-4 pb-8 lg:px-6 lg:pt-6">
      <div className="flex flex-col gap-2">
        <PageTitle area={view === 'GUARDIAN' ? 'familie' : 'unterricht'}>
          {child ? t('childTitle', { name: child.firstName }) : t('title')}
        </PageTitle>
        <p className="text-body-sm text-ink-muted">{t('mineHelp')}</p>
      </div>
      {children.length > 1 ? (
        <SegmentedNav
          label={t('child')}
          linkAs={Link}
          items={children.map((c) => ({
            key: c.id,
            href: `/noten?child=${c.id}`,
            label: c.firstName,
            current: c.id === child?.id,
          }))}
        />
      ) : null}
      {view === 'GUARDIAN' && !child ? null : <MyGrades studentId={child?.id} />}
    </div>
  );
}
