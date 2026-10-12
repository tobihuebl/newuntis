import { cn } from '@sp/ui';

/**
 * Seitenrahmen (Design System, Layout): Inhalt höchstens content-max breit (schmal: Formulare und Lesetexte),
 * Gutter space-4 mobil und space-6 ab 1024 px.
 */
export function Page({
  width = 'wide',
  className,
  children,
}: {
  width?: 'narrow' | 'medium' | 'wide';
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        'mx-auto flex w-full flex-col gap-8 px-4 pt-4 pb-8 lg:px-6 lg:pt-6',
        width === 'narrow' && 'max-w-2xl',
        width === 'medium' && 'max-w-4xl',
        width === 'wide' && 'max-w-(--content-max)',
        className,
      )}
    >
      {children}
    </div>
  );
}

/**
 * Seitenkopf (Design System, Layout): overline (Bereich), h1 (Titel), optional eine Zeile body-sm; die
 * Hauptaktion steht rechts neben dem Titel.
 */
export function PageHeader({
  overline,
  title,
  description,
  action,
  className,
}: {
  overline?: string;
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <header className={cn('flex flex-wrap items-end justify-between gap-4', className)}>
      <div className="flex min-w-0 flex-col gap-2">
        {overline ? <p className="text-overline text-brand-text">{overline}</p> : null}
        <h1 className="text-h1">{title}</h1>
        {description ? <div className="text-body-sm text-ink-muted">{description}</div> : null}
      </div>
      {action ? <div className="flex flex-wrap items-center gap-3">{action}</div> : null}
    </header>
  );
}
