import type { Metadata } from 'next';
import { SpecialPage } from '../../src/components/special-page';
import { getT } from '../../src/lib/nav-server';

export const metadata: Metadata = { robots: { index: false } };

/** Kein Zugriff (Design System, Fehler- und Sonderseiten): bekannte Seite, aber nicht für diese Rolle. */
export default async function NoAccessPage() {
  const t = await getT('special');
  return (
    <SpecialPage
      title={t('forbidden')}
      text={t('forbiddenText')}
      actionLabel={t('toStart')}
      actionHref="/"
    />
  );
}
