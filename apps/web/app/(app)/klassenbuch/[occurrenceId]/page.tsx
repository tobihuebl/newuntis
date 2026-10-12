import { ClassbookScreen } from '../../../../src/components/classbook/classbook-screen';
import { requireRoute } from '../../../../src/lib/route-guard';

/** Klassenbuch-Stunde: Daten kommen aus dem lokalen Speicher und dem Netz (offline-fähig). */
export default async function KlassenbuchStundePage({
  params,
  searchParams,
}: {
  params: Promise<{ occurrenceId: string }>;
  searchParams: Promise<{ von?: string }>;
}) {
  const { occurrenceId } = await params;
  const { von } = await searchParams;
  const me = await requireRoute(`/klassenbuch/${occurrenceId}`);
  const roles = me.user.roles.map((r) => r.role);
  const backHref =
    von === 'liste'
      ? '/klassenbuch'
      : roles.includes('TEACHER') || roles.includes('HOMEROOM')
        ? '/heute'
        : '/lagebild';
  return <ClassbookScreen id={occurrenceId} backHref={backHref} />;
}
