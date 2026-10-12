import { ClassAbsences } from '../../../../../src/components/absences/class-absences';
import { apiGet } from '../../../../../src/lib/api-server';
import { requireRoute } from '../../../../../src/lib/route-guard';

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireRoute(`/klasse/${id}/entschuldigungen`);
  const directory = await apiGet<{ classes: { id: string; name: string }[] }>(
    '/timetable/directory',
  );
  const name = directory.classes.find((c) => c.id === id)?.name ?? '';
  return <ClassAbsences classId={id} className={name} tab="entschuldigungen" />;
}
