import { redirect } from 'next/navigation';
import { can } from '@sp/shared';
import { PrivacyScreen } from '../../../../src/components/admin/privacy-screen';
import { requireRoute } from '../../../../src/lib/route-guard';

export default async function DatenschutzPage() {
  const me = await requireRoute('/admin/datenschutz');
  if (
    !can({ personId: me.user.personId, roles: me.user.roles.map((r) => r.role) }, 'privacy.manage')
  )
    redirect('/');
  return <PrivacyScreen />;
}
