import { moreSections, navViews, navigationFor } from '@sp/shared';
import { MoreScreen } from '../../../src/components/shell/more-screen';
import { navigationOf, getT } from '../../../src/lib/nav-server';
import { requireRoute } from '../../../src/lib/route-guard';
import { PageTitle } from '../../../src/components/page-title';

export default async function MorePage() {
  const me = await requireRoute('/mehr');
  const t = await getT('nav');
  const tr = await getT('roles');
  const nav = await navigationOf(me);
  const roles = [...new Set(me.user.roles.map((r) => r.role))];
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-6 lg:px-6">
      <PageTitle area="konto">{t('moreTitle')}</PageTitle>
      <MoreScreen
        sections={moreSections(nav)}
        views={navViews(roles).map((role) => ({
          role,
          label: tr(role),
          home: navigationFor(roles, role).home,
        }))}
        view={nav.view}
        userName={`${me.user.firstName} ${me.user.lastName}`}
        roleLabel={nav.view ? tr(nav.view) : ''}
        schoolName={me.tenant.name}
      />
    </div>
  );
}
