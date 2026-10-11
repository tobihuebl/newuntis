import { getTranslations } from 'next-intl/server';
import { Card, EmptyState } from '@sp/ui';
import { requireRoute } from '../../../src/lib/route-guard';

/** Platzhalter für Routen späterer Meilensteine. Die Rollenprüfung gilt schon jetzt. */
export default async function PlaceholderPage({ params }: { params: Promise<{ slug: string[] }> }) {
  const { slug } = await params;
  await requireRoute(`/${slug.join('/')}`);
  const t = await getTranslations('placeholder');
  return (
    <div className="mx-auto max-w-2xl p-4">
      <Card>
        <EmptyState title={t('title')} description={t('description')} />
      </Card>
    </div>
  );
}
