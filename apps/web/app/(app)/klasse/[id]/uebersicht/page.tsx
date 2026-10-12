import { redirect } from 'next/navigation';
import { requireRoute } from '../../../../../src/lib/route-guard';

/** Übersicht der Klasse: bis zu den Auswertungen (M6) direkt zu den Entschuldigungen. */
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireRoute(`/klasse/${id}/uebersicht`);
  redirect(`/klasse/${id}/entschuldigungen`);
}
