import { OverviewScreen } from '../../../src/components/admin/overview-screen';
import { requireRoute } from '../../../src/lib/route-guard';

/** Startseite der Administration: Checkliste "Schule einrichten" (Design System, Screens Abschnitt 11). */
export default async function AdminOverviewPage() {
  await requireRoute('/admin');
  return <OverviewScreen />;
}
