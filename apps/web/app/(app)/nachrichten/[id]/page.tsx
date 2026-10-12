import { ThreadScreen } from '../../../../src/components/messages/thread-screen';
import { requireRoute } from '../../../../src/lib/route-guard';

export default async function GespraechPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireRoute(`/nachrichten/${id}`);
  return <ThreadScreen id={id} />;
}
