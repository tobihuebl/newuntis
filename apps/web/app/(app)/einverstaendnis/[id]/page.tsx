import { ConsentFormDetailScreen } from '../../../../src/components/consent/consent-forms';
import { requireRoute } from '../../../../src/lib/route-guard';

export default async function EinverstaendniserklaerungPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  await requireRoute(`/einverstaendnis/${id}`);
  return <ConsentFormDetailScreen id={id} />;
}
