import * as React from 'react';
import { cn } from '../cn';
import type { LinkComponent } from './navigation';

export interface SegmentedNavItem {
  key: string;
  label: string;
  href: string;
  current?: boolean;
}

export interface SegmentedNavProps {
  /** Name der Navigation für Screenreader, z. B. "Kind wählen". */
  label: string;
  items: SegmentedNavItem[];
  linkAs: LinkComponent;
  className?: string;
}

/**
 * Umschalter zwischen Ansichten als Links (Kind, Unterseite): sieht aus wie `SegmentedControl`, ist aber
 * Navigation mit `aria-current="page"` statt einer Radiogruppe.
 */
export function SegmentedNav({ label, items, linkAs: Link, className }: SegmentedNavProps) {
  return (
    <nav
      aria-label={label}
      className={cn(
        'inline-flex max-w-full flex-wrap gap-1 self-start rounded-pill bg-bg-sunken p-1 ring-control',
        className,
      )}
    >
      {items.map((i) => (
        <Link
          key={i.key}
          href={i.href}
          aria-current={i.current ? 'page' : undefined}
          className={cn(
            // Mobil schmaler, damit drei Ansichten bei 390 px in eine Zeile passen
            'pf-focusable inline-flex min-h-10 min-w-(--tap-min) items-center justify-center rounded-pill px-3 text-label transition-colors duration-150 sm:px-4',
            i.current ? 'bg-bg-raised text-ink shadow-card' : 'text-ink-muted hover:text-ink',
          )}
        >
          {i.label}
        </Link>
      ))}
    </nav>
  );
}
