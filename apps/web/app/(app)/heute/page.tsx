import { Suspense } from 'react';
import { TodayScreen } from '../../../src/components/today/today-screen';
import { requireRoute } from '../../../src/lib/route-guard';

/** Heute (DB-01, KB-01): Inhalte lädt der Client, damit die Ansicht auch offline funktioniert. */
export default async function HeutePage() {
  const me = await requireRoute('/heute');
  return (
    <Suspense>
      <TodayScreen firstName={me.user.firstName} />
    </Suspense>
  );
}
