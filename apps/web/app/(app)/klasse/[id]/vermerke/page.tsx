import { redirect } from 'next/navigation';
import { ClassRemarks } from '../../../../../src/components/classbook/class-remarks';
import { apiGet } from '../../../../../src/lib/api-server';
import { canSeeRemarks, requireRoute } from '../../../../../src/lib/route-guard';

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const me = await requireRoute(`/klasse/${id}/vermerke`);
  if (!canSeeRemarks(me, id)) redirect('/kein-zugriff');
  const directory = await apiGet<{ classes: { id: string; name: string }[] }>(
    '/timetable/directory',
  );
  const name = directory.classes.find((c) => c.id === id)?.name ?? '';
  return <ClassRemarks classId={id} className={name} />;
}
