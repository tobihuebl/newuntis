import { AnnouncementsAdmin } from '../../../src/components/messages/announcements-admin';
import { requireRoute } from '../../../src/lib/route-guard';

export default async function RundschreibenPage() {
  await requireRoute('/rundschreiben');
  return <AnnouncementsAdmin />;
}
