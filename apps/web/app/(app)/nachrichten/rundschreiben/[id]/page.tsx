import { AnnouncementView } from '../../../../../src/components/messages/announcement-view';
import { requireRoute } from '../../../../../src/lib/route-guard';

export default async function RundschreibenLesenPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  await requireRoute(`/nachrichten/rundschreiben/${id}`);
  return <AnnouncementView id={id} />;
}
