import { Suspense } from 'react';
import { hasScope } from '@sp/shared';
import { ReportsScreen } from '../../../src/components/principal/reports-screen';
import { requireRoute } from '../../../src/lib/route-guard';

export default async function AuswertungPage() {
  const me = await requireRoute('/auswertung');
  const user = { personId: me.user.personId, roles: me.user.roles.map((r) => r.role) };
  return (
    <Suspense>
      <ReportsScreen schoolWide={hasScope(user, 'reports.read', 'ALL')} />
    </Suspense>
  );
}
