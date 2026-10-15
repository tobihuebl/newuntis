import { NewConsentForm } from '../../../../src/components/consent/consent-forms';
import { requireRoute } from '../../../../src/lib/route-guard';

export default async function NeueEinverstaendniserklaerungPage() {
  await requireRoute('/einverstaendnis/neu');
  return <NewConsentForm />;
}
