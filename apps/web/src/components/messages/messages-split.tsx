'use client';
import { usePathname } from 'next/navigation';
import { EmptyState } from '@sp/ui';
import { useT } from '../../lib/i18n';

/**
 * Nachrichten ab 1024 px zweispaltig (Design System, Responsive Muster): links der Posteingang, rechts das
 * Gespräch bzw. Rundschreiben. Mobil Liste und Detail als eigene Seiten. "Neue Nachricht" nutzt die volle Breite.
 */
export function MessagesSplit({
  inbox,
  children,
}: {
  inbox: React.ReactNode;
  children: React.ReactNode;
}) {
  const t = useT('messages');
  const pathname = usePathname();
  if (pathname.startsWith('/nachrichten/neu')) return <>{children}</>;
  const list = pathname === '/nachrichten';
  return (
    <div className="lg:grid lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)] lg:divide-x lg:divide-line">
      {list ? children : <div className="hidden lg:block">{inbox}</div>}
      {list ? (
        <div className="hidden items-start justify-center pt-16 lg:flex">
          <EmptyState title={t('pickThread')} description={t('pickThreadText')} />
        </div>
      ) : (
        children
      )}
    </div>
  );
}
