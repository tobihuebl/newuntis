'use client';
import { cn } from '@sp/ui';
import { useT } from '../lib/i18n';

export type Area =
  | 'unterricht'
  | 'kommunikation'
  | 'direktion'
  | 'stammdaten'
  | 'administration'
  | 'konto'
  | 'familie'
  | 'klassenvorstand'
  | 'stundenplan';

/** Seitentitel mit Bereich als overline (Design System, Layout: overline · h1 · optional body-sm). */
export function PageTitle({
  area,
  className,
  docTitle,
  children,
}: {
  area: Area;
  className?: string;
  /** Neutraler Browser-Titel, wenn die Überschrift Namen enthält (siehe DocumentTitle). */
  docTitle?: string;
  children: React.ReactNode;
}) {
  const t = useT('areas');
  return (
    <div className={cn('flex min-w-0 flex-col gap-2', className)}>
      <p className="text-overline text-brand-text">{t(area)}</p>
      <h1 className="text-h1 break-words" data-doc-title={docTitle}>
        {children}
      </h1>
    </div>
  );
}
