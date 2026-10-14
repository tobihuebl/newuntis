import { can } from '@sp/shared';
import { ExamsScreen } from '../../../src/components/teacher/exams-screen';
import { requireRoute } from '../../../src/lib/route-guard';

export default async function PruefungenPage() {
  const me = await requireRoute('/pruefungen');
  // Eintragen dürfen Lehrkräfte (eigene Fächer) und die Direktion; die Administration sieht nur den Kalender
  const writer = can(
    { personId: me.user.personId, roles: me.user.roles.map((r) => r.role) },
    'exam.write',
  );
  return <ExamsScreen canWrite={writer} />;
}
