import { Suspense } from 'react';
import { DashboardScreen } from '../../../src/components/principal/dashboard-screen';
import { requireRoute } from '../../../src/lib/route-guard';

export default async function LagebildPage() {
  await requireRoute('/lagebild');
  return (
    <Suspense>
      <DashboardScreen />
    </Suspense>
  );
}
