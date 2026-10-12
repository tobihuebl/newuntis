import { ClassesScreen } from '../../../src/components/teacher/classes-screen';
import { requireRoute } from '../../../src/lib/route-guard';

export default async function KlassenPage() {
  await requireRoute('/klassen');
  return <ClassesScreen />;
}
