import { Card, Logo, RasterMotif } from '@sp/ui';
import { getT } from '../../src/lib/nav-server';

/**
 * Anmeldung und weitere öffentliche Seiten (Design System, Screens "Anmeldung"): mobil Nachtfläche oben mit Logo,
 * darunter die Karte; ab 1024 px zweigeteilt mit Raster-Motiv und Claim links, Karte (420 px) rechts.
 */
export default async function PublicLayout({ children }: { children: React.ReactNode }) {
  const t = await getT('app');
  return (
    <main className="min-h-dvh bg-bg lg:grid lg:grid-cols-2">
      <section className="flex flex-col gap-8 bg-bg-night px-4 pt-[calc(var(--space-10)+env(safe-area-inset-top))] pb-16 text-ink-on-night lg:justify-between lg:p-16 lg:pb-16">
        <Logo onNight size="md" />
        <div className="hidden flex-col gap-10 lg:flex">
          <RasterMotif onNight className="max-w-md" />
          <p className="max-w-lg font-heading text-display-xl text-ink-on-night">{t('claim')}</p>
          <p className="text-body-lg text-ink-on-night-muted">{t('description')}</p>
        </div>
      </section>
      <div className="flex justify-center px-4 lg:items-center lg:p-12">
        <Card className="-mt-10 flex w-full max-w-105 flex-col gap-4 lg:mt-0">{children}</Card>
      </div>
    </main>
  );
}
