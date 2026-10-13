import Link from 'next/link';
import { FilePen } from 'lucide-react';
import { Chip, Card, EmptyState, ListRow } from '@sp/ui';
import { apiGet } from '../../../src/lib/api-server';
import { shortDate } from '../../../src/lib/dates';
import { requireRoute } from '../../../src/lib/route-guard';
import { getT } from '../../../src/lib/nav-server';
import { PageTitle } from '../../../src/components/page-title';

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
  const t = await getT('approvals');
  const { data } = await apiGet<{ data: Version[] }>('/admin/timetable-versions');
  const drafts = data.filter((v) => v.status === 'DRAFT');
  const current = data.find((v) => v.status === 'PUBLISHED');
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 pt-4 pb-8 lg:px-6 lg:pt-6">
      <div className="flex flex-col gap-2">
        <PageTitle area="direktion">{t('title')}</PageTitle>
        <p className="text-body-sm text-ink-muted">{t('intro')}</p>
      </div>
      {drafts.length === 0 ? (
        <Card flat>
          <EmptyState title={t('empty')} description={t('emptyText')} />
        </Card>
      ) : (
        <Card className="p-0">
          <ul>
            {drafts.map((v) => (
              <ListRow
                key={v.id}
                as="li"
                href={`/admin/stundenplan/${v.id}`}
                linkAs={Link}
                className="min-h-16 py-3"
                title={v.name ?? t('unnamed')}
                subtitle={`${v.schoolYear.name} · ${t('validFrom', { date: shortDate(v.validFrom) })} · ${t('lessons', { count: v.lessonCount })}`}
                trailing={
                  <Chip tone="absent" icon={FilePen}>
                    {t('draft')}
                  </Chip>
                }
              />
            ))}
          </ul>
        </Card>
      )}
      {current ? (
        <p className="text-body-sm text-ink-muted">
          {t('current', { name: current.name ?? t('unnamed'), date: shortDate(current.validFrom) })}
        </p>
      ) : null}
    </div>
  );
}
