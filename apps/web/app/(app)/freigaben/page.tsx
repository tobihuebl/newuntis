import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { Badge, Card, EmptyState } from '@sp/ui';
import { apiGet } from '../../../src/lib/api-server';
import { shortDate } from '../../../src/lib/dates';
import { requireRoute } from '../../../src/lib/route-guard';

interface Version {
  id: string;
  name: string | null;
  status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
  validFrom: string;
  schoolYear: { name: string };
  lessonCount: number;
}

/** Freigaben der Direktion: Stundenplan-Entwürfe prüfen und veröffentlichen (Rechte-Matrix "freigeben"). */
export default async function FreigabenPage() {
  await requireRoute('/freigaben');
  const t = await getTranslations('approvals');
  const { data } = await apiGet<{ data: Version[] }>('/admin/timetable-versions');
  const drafts = data.filter((v) => v.status === 'DRAFT');
  const current = data.find((v) => v.status === 'PUBLISHED');
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4 p-4">
      <div>
        <h1 className="text-2xl font-semibold">{t('title')}</h1>
        <p className="text-sm text-muted">{t('intro')}</p>
      </div>
      {drafts.length === 0 ? (
        <Card>
          <EmptyState title={t('empty')} description={t('emptyText')} />
        </Card>
      ) : (
        <Card className="p-0">
          <ul>
            {drafts.map((v) => (
              <li key={v.id} className="border-b border-border last:border-b-0">
                <Link
                  href={`/admin/stundenplan/${v.id}`}
                  className="flex min-h-16 flex-wrap items-center justify-between gap-2 px-4 py-3 hover:bg-surface-2"
                >
                  <span>
                    <span className="block font-medium">{v.name ?? t('unnamed')}</span>
                    <span className="block text-sm text-muted">
                      {v.schoolYear.name} · {t('validFrom', { date: shortDate(v.validFrom) })} ·{' '}
                      {t('lessons', { count: v.lessonCount })}
                    </span>
                  </span>
                  <Badge tone="warning">{t('draft')}</Badge>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}
      {current ? (
        <p className="text-sm text-muted">
          {t('current', { name: current.name ?? t('unnamed'), date: shortDate(current.validFrom) })}
        </p>
      ) : null}
    </div>
  );
}
