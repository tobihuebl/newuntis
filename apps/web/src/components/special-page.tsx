import Link from 'next/link';
import { Button, Logo, RasterMotif } from '@sp/ui';

/**
 * Fehler- und Sonderseiten (Design System, Screens Abschnitt 12): Nachtfläche, Raster-Motiv mit einer leeren
 * Kachel, ein Satz, eine Hauptaktion.
 */
export function SpecialPage({
  title,
  text,
  actionLabel,
  actionHref,
}: {
  title: string;
  text?: string;
  actionLabel: string;
  actionHref: string;
}) {
  return (
    <main className="flex min-h-dvh flex-col bg-bg-night px-4 py-10 text-ink-on-night lg:px-16">
      <Logo onNight size="sm" />
      <div className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center gap-8">
        <RasterMotif onNight variant="empty" className="max-w-sm" />
        <h1 className="text-display-lg text-ink-on-night">{title}</h1>
        {text ? <p className="text-body-lg text-ink-on-night-muted">{text}</p> : null}
        <Button asChild size="lg" className="self-start">
          <Link href={actionHref}>{actionLabel}</Link>
        </Button>
      </div>
    </main>
  );
}
