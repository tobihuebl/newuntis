import { ClassbookList } from '../../../src/components/classbook/classbook-list';
import { requireRoute } from '../../../src/lib/route-guard';

export default async function KlassenbuchPage() {
  await requireRoute('/klassenbuch');
  return <ClassbookList />;
}
