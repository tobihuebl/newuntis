import { getTranslations } from 'next-intl/server';
import { Card, EmptyState } from '@sp/ui';
import { requireRoute } from '../../../src/lib/route-guard';

export default async function HeutePage() {
  await requireRoute('/heute');
  const t = await getTranslations();
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4 p-4">
      <h1 className="text-2xl font-semibold">{t('today.title')}</h1>
      <Card>
        <EmptyState title={t('today.emptyTitle')} description={t('today.emptyDescription')} />
      </Card>
    </div>
  );
}
