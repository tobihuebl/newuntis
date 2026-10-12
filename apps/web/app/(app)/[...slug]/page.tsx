import { Card, EmptyState } from '@sp/ui';
import { requireRoute } from '../../../src/lib/route-guard';
import { getT } from '../../../src/lib/nav-server';

/** Platzhalter für Routen späterer Meilensteine. Die Rollenprüfung gilt schon jetzt. */
export default async function PlaceholderPage({ params }: { params: Promise<{ slug: string[] }> }) {
  const { slug } = await params;
  await requireRoute(`/${slug.join('/')}`);
  const t = await getT('placeholder');
  return (
    <div className="mx-auto w-full max-w-2xl px-4 pt-4 pb-8 lg:px-6 lg:pt-6">
      <Card flat>
        <EmptyState title={t('title')} description={t('description')} />
      </Card>
    </div>
  );
}
