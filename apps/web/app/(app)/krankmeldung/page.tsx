import { SickReport } from '../../../src/components/teacher/sick-report';
import { requireRoute } from '../../../src/lib/route-guard';

export default async function KrankmeldungPage() {
  await requireRoute('/krankmeldung');
  return <SickReport />;
}
