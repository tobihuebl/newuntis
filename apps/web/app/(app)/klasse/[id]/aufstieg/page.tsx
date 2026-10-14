import { PromotionsScreen } from '../../../../../src/components/transition/promotions-screen';
import { requireRoute } from '../../../../../src/lib/route-guard';

/** Schuljahresende einer Klasse (SD-05): Entscheidungen je Schüler:in. */
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireRoute(`/klasse/${id}/aufstieg`);
  return <PromotionsScreen classId={id} />;
}
