import { Suspense } from 'react';
import { SubstitutionScreen } from '../../../src/components/substitution/substitution-screen';
import { requireRoute } from '../../../src/lib/route-guard';

export default async function SupplierungPage() {
  await requireRoute('/supplierung');
  return (
    <Suspense>
      <SubstitutionScreen />
    </Suspense>
  );
}
