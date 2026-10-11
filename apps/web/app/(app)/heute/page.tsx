import { getTranslations } from 'next-intl/server';
import { Card, EmptyState, StatusBadge } from '@sp/ui';

export default async function HeutePage() {
  const t = await getTranslations();
  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-4 p-4">
      <h1 className="text-2xl font-semibold">{t('today.title')}</h1>
      <Card>
        <EmptyState title={t('today.emptyTitle')} description={t('today.emptyDescription')} />
      </Card>
      <div className="flex flex-wrap gap-2">
        <StatusBadge status="present" label={t('status.present')} />
        <StatusBadge status="late" label={t('status.late')} />
        <StatusBadge status="absent" label={t('status.absent')} />
        <StatusBadge status="excused" label={t('status.excused')} />
        <StatusBadge status="cancelled" label={t('status.cancelled')} />
        <StatusBadge status="substituted" label={t('status.substituted')} />
        <StatusBadge status="roomChanged" label={t('status.roomChanged')} />
      </div>
    </main>
  );
}
