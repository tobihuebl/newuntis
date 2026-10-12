import { AnnouncementStats } from '../../../../src/components/messages/announcements-admin';
import { requireRoute } from '../../../../src/lib/route-guard';

export default async function RundschreibenStatistikPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  await requireRoute(`/rundschreiben/${id}`);
  return <AnnouncementStats id={id} />;
}
