import { redirect } from 'next/navigation';
import { can } from '@sp/shared';
import { RolesScreen } from '../../../../src/components/admin/roles-screen';
import { requireRoute } from '../../../../src/lib/route-guard';

export default async function RollenPage() {
  const me = await requireRoute('/admin/rollen');
  if (!can({ personId: me.user.personId, roles: me.user.roles.map((r) => r.role) }, 'roles.manage'))
    redirect('/');
  return <RolesScreen />;
}
