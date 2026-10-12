import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { Button, Card, EmptyState } from '@sp/ui';

/** Ersatzseite des Service Workers für Seiten, die offline nicht gespeichert sind. */
export default async function OfflinePage() {
  const t = await getTranslations('offline');
  return (
    <main className="mx-auto flex min-h-dvh max-w-md items-center p-4">
      <Card className="w-full">
        <EmptyState
          title={t('title')}
          description={t('description')}
          action={
            <Button asChild>
              <Link href="/heute">{t('toToday')}</Link>
            </Button>
          }
        />
      </Card>
    </main>
  );
}
