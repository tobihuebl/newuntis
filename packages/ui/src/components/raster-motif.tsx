import * as React from 'react';
import { cn } from '../cn';

/** Kachel: Spalte, Zeile, Breite (verschmolzene Kacheln wie Doppelstunden), Ton. */
type Tile = [number, number, number, 'k' | 'a' | 'q' | 's'];

/**
 * 6 × 4-Raster wie im Cover des Design Systems: zwei bis vier Kobalt-, ein bis zwei Amber-Kacheln, der Rest ruhig.
 * "empty" (Fehlerseiten): eine Kachel fehlt.
 */
const HERO: Tile[] = [
  [0, 0, 1, 'q'], [1, 0, 1, 's'], [2, 0, 2, 'k'], [4, 0, 1, 'q'], [5, 0, 1, 's'],
  [0, 1, 2, 'q'], [2, 1, 1, 'a'], [3, 1, 1, 's'], [4, 1, 1, 'k'], [5, 1, 1, 'q'],
  [0, 2, 1, 'k'], [1, 2, 1, 's'], [2, 2, 1, 'q'], [3, 2, 2, 's'], [5, 2, 1, 'q'],
  [0, 3, 1, 'q'], [1, 3, 2, 's'], [3, 3, 1, 'k'], [4, 3, 1, 'a'], [5, 3, 1, 's'],
];

export interface RasterMotifProps {
  /** Auf Nachtfläche: ruhige Kacheln in bg-night-raised; auf Creme in brand-soft und line. */
  onNight?: boolean;
  variant?: 'hero' | 'empty';
  className?: string;
}

/** Raster-Motiv (CI-Handbuch, Bildsprache): rein dekorativ, für Hero-, Anmelde- und Fehlerseiten. */
export function RasterMotif({ onNight, variant = 'hero', className }: RasterMotifProps) {
  const tiles = variant === 'empty' ? HERO.filter(([c, r]) => !(c === 2 && r === 1)) : HERO;
  const fill = {
    k: 'fill-brand',
    a: 'fill-signal',
    q: onNight ? 'fill-bg-night-raised' : 'fill-line',
    s: onNight ? 'fill-bg-night-raised' : 'fill-brand-soft',
  } as const;
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 424 280"
      className={cn('h-auto w-full', className)}
      xmlns="http://www.w3.org/2000/svg"
    >
      {tiles.map(([c, r, w, tone]) => (
        <rect
          key={`${c}-${r}`}
          x={c * 72}
          y={r * 72}
          width={w * 72 - 8}
          height={64}
          rx={14}
          className={fill[tone]}
        />
      ))}
      {variant === 'empty' ? (
        <rect
          x={2 * 72 + 1}
          y={72 + 1}
          width={62}
          height={62}
          rx={14}
          className="fill-none stroke-line-strong"
          strokeDasharray="6 6"
          strokeWidth={2}
        />
      ) : null}
    </svg>
  );
}
