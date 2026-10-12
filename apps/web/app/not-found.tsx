import { SpecialPage } from '../src/components/special-page';
import { getT } from '../src/lib/nav-server';

/** 404 (Design System, Fehler- und Sonderseiten). */
export default async function NotFound() {
  const t = await getT('special');
  return <SpecialPage title={t('notFound')} actionLabel={t('toStart')} actionHref="/" />;
}
