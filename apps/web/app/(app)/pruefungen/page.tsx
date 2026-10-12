import { ExamsScreen } from '../../../src/components/teacher/exams-screen';
import { requireRoute } from '../../../src/lib/route-guard';

export default async function PruefungenPage() {
  await requireRoute('/pruefungen');
  return <ExamsScreen />;
}
