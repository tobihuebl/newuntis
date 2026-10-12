import { SpecialPage } from '../../src/components/special-page';
import { getT } from '../../src/lib/nav-server';

/** Ersatzseite des Service Workers für Seiten, die offline nicht gespeichert sind. */
export default async function OfflinePage() {
  const t = await getT('offline');
  return (
    <SpecialPage
      title={t('title')}
      text={t('description')}
      actionLabel={t('toToday')}
      actionHref="/heute"
    />
  );
}
