import { redirect } from 'next/navigation';
import { requireRoute } from '../../../../../src/lib/route-guard';

/** Alte Adresse der Klassenübersicht: die Klassenseite liegt unter /klassen/[id] (mit Reitern für den KV). */
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireRoute(`/klasse/${id}/uebersicht`);
  redirect(`/klassen/${id}`);
}
