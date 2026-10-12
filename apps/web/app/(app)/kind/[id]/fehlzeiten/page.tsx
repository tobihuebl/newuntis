import { ChildAbsences } from '../../../../../src/components/absences/child-absences';
import { requireRoute } from '../../../../../src/lib/route-guard';

export default async function FehlzeitenPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireRoute(`/kind/${id}/fehlzeiten`);
  return <ChildAbsences studentId={id} />;
}
