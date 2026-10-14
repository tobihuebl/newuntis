import { AccessLettersScreen } from '../../../../../src/components/onboarding/access-letters';
import { requireRoute } from '../../../../../src/lib/route-guard';

/** Zugangsbriefe der Klasse (Onboarding, ADR 0020): persönlicher Code und QR-Code je Schüler:in. */
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireRoute(`/klasse/${id}/zugang`);
  return <AccessLettersScreen classId={id} />;
}
