import { ClassDetailScreen } from '../../../../src/components/teacher/classes-screen';
import { requireRoute } from '../../../../src/lib/route-guard';

export default async function KlassePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireRoute(`/klassen/${id}`);
  return <ClassDetailScreen id={id} />;
}
