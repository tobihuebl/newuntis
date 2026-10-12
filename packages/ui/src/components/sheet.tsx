'use client';
import * as React from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { cn } from '../cn';

export interface SheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  /** Beschriftung der Schließen-Schaltfläche (Screenreader). */
  closeLabel: string;
  children: React.ReactNode;
}

/** Ab dieser Strecke (nach unten gewischt) schließt das Sheet. */
const SWIPE_CLOSE = 96;

/**
 * Sheet (Design System, pf-sheet): mobil Bottom-Sheet mit Griff und radius-xl, ab Tablet zentrierter Dialog mit
 * derselben Füllung. Schließen per Wischen, Esc, Zurück und sichtbarem Schließen-Button; Fokusfalle und Rückgabe
 * des Fokus kommen von Radix. Genau ein Primär-Button im Inhalt.
 */
export function Sheet({
  open,
  onOpenChange,
  title,
  description,
  closeLabel,
  children,
}: SheetProps) {
  const [drag, setDrag] = React.useState(0);
  const start = React.useRef<number | null>(null);

  const onPointerDown = (e: React.PointerEvent) => {
    start.current = e.clientY;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (start.current !== null) setDrag(Math.max(0, e.clientY - start.current));
  };
  const onPointerUp = () => {
    if (drag > SWIPE_CLOSE) onOpenChange(false);
    start.current = null;
    setDrag(0);
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="pf-scrim fixed inset-0 z-sheet animate-fade-in" />
        <Dialog.Content
          style={drag ? { transform: `translateY(${drag}px)` } : undefined}
          className={cn(
            'pf-sheet fixed z-sheet flex max-h-[90dvh] flex-col gap-4 overflow-y-auto text-ink',
            'inset-x-0 bottom-0 animate-sheet-in pb-[calc(var(--space-6)+env(safe-area-inset-bottom))]',
            'md:inset-auto md:top-1/2 md:left-1/2 md:w-[calc(100%-var(--space-8))] md:max-w-130 md:-translate-x-1/2 md:-translate-y-1/2 md:animate-dialog-in md:rounded-xl md:p-6',
          )}
        >
          <div
            className="-mx-5 -mt-3 touch-none px-5 pt-3 md:hidden"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
          >
            <div className="pf-sheet__grab mb-0" aria-hidden="true" />
          </div>
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <Dialog.Title asChild>
                <h2 className="pf-card__title">{title}</h2>
              </Dialog.Title>
              {description ? (
                <Dialog.Description className="pf-card__sub">{description}</Dialog.Description>
              ) : (
                <Dialog.Description className="sr-only">{title}</Dialog.Description>
              )}
            </div>
            <Dialog.Close
              aria-label={closeLabel}
              className="-mt-2 -mr-2 inline-flex size-(--tap-min) shrink-0 items-center justify-center rounded-md text-ink-muted hover:bg-brand-soft hover:text-ink"
            >
              <X aria-hidden="true" className="size-5" />
            </Dialog.Close>
          </div>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
