import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { moreFor } from '@sp/shared';
import { Card, ListRow } from '@sp/ui';
import { NAV_ICONS } from '../../../src/components/nav-icons';
import { requireRoute } from '../../../src/lib/route-guard';

export default async function MorePage() {
  const me = await requireRoute('/mehr');
  const t = await getTranslations('nav');
  const items = moreFor(me.user.roles.map((r) => r.role));
  return (
    <div className="mx-auto max-w-2xl p-4">
      <h1 className="mb-4 text-h1">{t('moreTitle')}</h1>
      <Card className="p-0">
        {items.map((i) => {
          const Icon = NAV_ICONS[i.icon];
          return (
            <Link key={i.href} href={i.href} className="block hover:bg-bg-sunken">
              <ListRow
                title={t(i.labelKey)}
                leading={Icon ? <Icon aria-hidden="true" size={20} /> : null}
              />
            </Link>
          );
        })}
      </Card>
    </div>
  );
}
