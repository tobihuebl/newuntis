import * as React from 'react';
import { Ban, TriangleAlert } from 'lucide-react';
import { cn } from '../cn';

/** Fächerfarben (Tokens fach-*); Amber ist Konflikten vorbehalten. */
export type FachTone =
  'kobalt' | 'mint' | 'himmel' | 'flieder' | 'rosa' | 'limette' | 'koralle' | 'sand';

export interface TimetableColumn {
  key: string;
  /** Kurz, z. B. "Mo 12. Okt." */
  label: string;
  current?: boolean;
}

export interface TimetableRow {
  key: string;
  /** Stundennummer in Mono, z. B. "1". */
  label: string;
  /** Uhrzeit für Tooltip und Screenreader, z. B. "08:00 bis 08:50". */
  title?: string;
}

export interface TimetableGridProps {
  columns: TimetableColumn[];
  rows: TimetableRow[];
  ariaLabel: string;
  className?: string;
  children: React.ReactNode;
}

/**
 * Stundenplan-Raster (Design System, pf-tt): Stunden als Zeilen, Tage als Spalten, Fächer als bunte Kacheln
 * (TimetableCell). Ab Tablet (bp-md); mobil zeigt die Seite eine Tagesliste.
 */
export function TimetableGrid({
  columns,
  rows,
  ariaLabel,
  className,
  children,
}: TimetableGridProps) {
  return (
    <div
      role="region"
      aria-label={ariaLabel}
      className={cn('pf-tt', className)}
      style={{
        gridTemplateColumns: `var(--space-8) repeat(${columns.length}, minmax(0, 1fr))`,
        gridTemplateRows: `auto repeat(${rows.length}, minmax(var(--space-16), auto))`,
      }}
    >
      <span aria-hidden="true" />
      {columns.map((c, i) => (
        <span
          key={c.key}
          aria-current={c.current ? 'date' : undefined}
          className={cn('pf-tt__head', c.current && 'rounded-pill bg-brand-soft text-brand-text')}
          style={{ gridColumn: i + 2, gridRow: 1 }}
        >
          {c.label}
        </span>
      ))}
      {rows.map((r, i) => (
        <span
          key={r.key}
          aria-hidden="true"
          title={r.title}
          className="pf-tt__slot"
          style={{ gridColumn: 1, gridRow: i + 2 }}
        >
          {r.label}
        </span>
      ))}
      {children}
    </div>
  );
}

export interface TimetableCellProps extends React.HTMLAttributes<HTMLElement> {
  /** Spalte und Zeile ab 0 (ohne Kopf und Stundenspalte). */
  column: number;
  row: number;
  /** Doppelstunden: Kachel zwei Zeilen hoch. */
  span?: number;
  fach?: FachTone;
  /** conflict: Amber mit Wort; subst: Vertretung (Amber weich mit Rand); cancelled: Entfall; empty: freie Zelle. */
  state?: 'normal' | 'conflict' | 'subst' | 'cancelled' | 'empty';
  /** Wort zum Zustand (Konflikt, Entfall), sichtbar und vorgelesen. */
  stateLabel?: string;
  /** Aktuelle Stunde: Nacht-Rand. */
  now?: boolean;
  /** Beim Ziehen im Editor angehoben. */
  dragging?: boolean;
  as?: React.ElementType;
  href?: string;
}

/** Kachel im Stundenplan-Raster (pf-tt__cell): Fach fett, Raum oder Lehrkraft in Mono darunter. */
export function TimetableCell({
  column,
  row,
  span = 1,
  fach,
  state = 'normal',
  stateLabel,
  now,
  dragging,
  as,
  className,
  style,
  children,
  ...props
}: TimetableCellProps) {
  const Comp = as ?? 'div';
  return (
    <Comp
      className={cn(
        'pf-tt__cell pf-focusable',
        state === 'empty' || state === 'cancelled' ? 'pf-tt__cell--empty' : fach && `is-${fach}`,
        state === 'conflict' && 'is-conflict',
        state === 'subst' && 'is-subst',
        dragging && 'is-drag',
        now && state !== 'conflict' && 'tt-now',
        Comp === 'div' && 'cursor-default active:scale-100',
        className,
      )}
      style={{ gridColumn: column + 2, gridRow: `${row + 2} / span ${span}`, ...style }}
      data-state={state}
      {...props}
    >
      {state === 'conflict' ? <TriangleAlert aria-hidden="true" /> : null}
      {state === 'cancelled' ? <Ban aria-hidden="true" /> : null}
      {children}
      {stateLabel ? <small className="pf-tt__state">{stateLabel}</small> : null}
    </Comp>
  );
}

/** Statische Klassen je Fächerfarbe (Tailwind erkennt keine zusammengesetzten Klassennamen). */
export const FACH_BG: Record<FachTone, string> = {
  kobalt: 'bg-fach-kobalt',
  mint: 'bg-fach-mint',
  himmel: 'bg-fach-himmel',
  flieder: 'bg-fach-flieder',
  rosa: 'bg-fach-rosa',
  limette: 'bg-fach-limette',
  koralle: 'bg-fach-koralle',
  sand: 'bg-fach-sand',
};
export const FACH_BORDER: Record<FachTone, string> = {
  kobalt: 'border-fach-kobalt',
  mint: 'border-fach-mint',
  himmel: 'border-fach-himmel',
  flieder: 'border-fach-flieder',
  rosa: 'border-fach-rosa',
  limette: 'border-fach-limette',
  koralle: 'border-fach-koralle',
  sand: 'border-fach-sand',
};
