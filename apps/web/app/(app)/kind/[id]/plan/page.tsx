import { redirect } from 'next/navigation';

/** Route aus der Spec (Abschnitt 5) für Eltern: führt zur Wochenansicht des Kindes. */
export default async function ChildPlanPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/plan?child=${encodeURIComponent(id)}`);
}
