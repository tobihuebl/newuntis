import { AssistantScreen } from '../../../../src/components/planning/assistant-screen';
import { requireRoute } from '../../../../src/lib/route-guard';

/** Stundenplan-Assistent (M7, ADR 0012). */
export default async function AssistantPage({
  searchParams,
}: {
  searchParams: Promise<{ version?: string }>;
}) {
  await requireRoute('/admin/assistent');
  const { version } = await searchParams;
  return <AssistantScreen initialVersionId={version ?? null} />;
}
