import { DoorOpen } from 'lucide-react';
import Link from 'next/link';
import { Card, EmptyState } from '@sp/ui';
import { apiGet } from '../../../src/lib/api-server';
import { requireRoute } from '../../../src/lib/route-guard';
import { getT } from '../../../src/lib/nav-server';
import { PageTitle } from '../../../src/components/page-title';

interface Directory {
  rooms: { id: string; name: string }[];
}

/** Räume (Spec Abschnitt 5): Übersicht mit Belegungsplan je Raum. */
export default async function RaeumePage() {
  await requireRoute('/raeume');
  const t = await getT('rooms');
  const { rooms } = await apiGet<Directory>('/timetable/directory');
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 pt-4 pb-8 lg:px-6 lg:pt-6">
      <div className="flex flex-col gap-2">
        <PageTitle area="unterricht">{t('title')}</PageTitle>
        <p className="text-body-sm text-ink-muted">{t('intro')}</p>
      </div>
      {rooms.length === 0 ? (
        <Card flat>
          <EmptyState title={t('empty')} />
        </Card>
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {rooms.map((r) => (
            <li key={r.id}>
              <Card interactive flat asChild className="flex min-h-16 items-center gap-3 py-3">
                <Link href={`/plan?room=${r.id}`}>
                  <DoorOpen aria-hidden="true" className="size-5 shrink-0 text-brand-text" />
                  <span className="text-body-strong">{r.name}</span>
                  <span className="sr-only">{t('openPlan')}</span>
                </Link>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
