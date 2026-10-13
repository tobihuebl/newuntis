import type { Metadata } from 'next';
import { Logo } from '@sp/ui';
import { ShowcasePanel } from '../../src/components/showcase/showcase-panel';
import { getT } from '../../src/lib/nav-server';

export const metadata: Metadata = { robots: { index: false, follow: false } };

/** Showcase des Design Systems (ADR 0010): alle Bausteine in allen Zuständen, hell und dunkel nebeneinander. */
export default async function ShowcasePage() {
  const t = await getT('showcase');
  return (
    <main className="mx-auto flex max-w-(--content-max) flex-col gap-8 px-4 py-8 lg:px-6">
      <header className="flex flex-col gap-3">
        <Logo />
        <p className="text-overline text-brand-text">{t('overline')}</p>
        <h1 className="text-h1">{t('title')}</h1>
        <p className="text-body-lg text-ink-muted">{t('intro')}</p>
        <p className="text-caption text-ink-subtle">{t('demo')}</p>
      </header>
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <ShowcasePanel theme="light" />
        <ShowcasePanel theme="dark" />
      </div>
    </main>
  );
}
