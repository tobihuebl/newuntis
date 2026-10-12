import { DoorOpen } from 'lucide-react';
import Link from 'next/link';
import { Card, EmptyState } from '@sp/ui';
import { apiGet } from '../../../src/lib/api-server';
import { requireRoute } from '../../../src/lib/route-guard';
import { getT } from '../../../src/lib/nav-server';

interface Directory {
  rooms: { id: string; name: string }[];
}

/** Räume (Spec Abschnitt 5): Übersicht mit Belegungsplan je Raum. */
export default async function RaeumePage() {
  await requireRoute('/raeume');
  const t = await getT('rooms');
  const { rooms } = await apiGet<Directory>('/timetable/directory');
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4 p-4">
      <div>
        <h1 className="text-h1">{t('title')}</h1>
        <p className="text-body-sm text-ink-muted">{t('intro')}</p>
      </div>
      {rooms.length === 0 ? (
        <Card>
          <EmptyState title={t('empty')} />
        </Card>
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {rooms.map((r) => (
            <li key={r.id}>
              <Link
                href={`/plan?room=${r.id}`}
                className="flex min-h-16 items-center gap-3 rounded-md border border-line bg-bg-raised px-4 hover:bg-bg-sunken"
              >
                <DoorOpen aria-hidden="true" size={20} className="text-ink-muted" />
                <span className="font-medium">{r.name}</span>
                <span className="sr-only">{t('openPlan')}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
