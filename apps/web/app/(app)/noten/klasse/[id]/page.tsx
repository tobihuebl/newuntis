import { ClassGradesScreen } from '../../../../../src/components/grades/class-grades';
import { requireRoute } from '../../../../../src/lib/route-guard';

export default async function ClassGradesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireRoute(`/noten/klasse/${id}`);
  return <ClassGradesScreen classId={id} />;
}
