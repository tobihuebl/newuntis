import { redirect } from 'next/navigation';
import { can } from '@sp/shared';
import { AuditList } from '../../../../src/components/admin/audit-list';
import { requireRoute } from '../../../../src/lib/route-guard';

export default async function AuditPage() {
  const me = await requireRoute('/admin/protokoll');
  if (!can({ personId: me.user.personId, roles: me.user.roles.map((r) => r.role) }, 'audit.read'))
    redirect('/');
  return <AuditList />;
}
