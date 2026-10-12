import { getTranslations } from 'next-intl/server';
import { Card } from '@sp/ui';

export default async function PublicLayout({ children }: { children: React.ReactNode }) {
  const t = await getTranslations('app');
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-6 p-4">
      <p className="text-center text-h3 text-brand-text">{t('name')}</p>
      <Card className="flex flex-col gap-4 p-6">{children}</Card>
    </main>
  );
}
