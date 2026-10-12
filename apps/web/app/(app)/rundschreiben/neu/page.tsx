import { AnnouncementForm } from '../../../../src/components/messages/announcements-admin';
import { requireRoute } from '../../../../src/lib/route-guard';

export default async function NeuesRundschreibenPage() {
  await requireRoute('/rundschreiben/neu');
  return <AnnouncementForm />;
}
