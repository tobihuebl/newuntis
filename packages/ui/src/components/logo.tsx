import * as React from 'react';
import { cn } from '../cn';

/** Kacheln des Raster-P (3 × 5, zehn Kacheln), Kachel rechts oben im Bogen ist Amber (CI-Handbuch Abschnitt 3). */
const TILES: [number, number][] = [
  [0, 0],
  [116, 0],
  [232, 0],
  [0, 116],
  [0, 232],
  [116, 232],
  [232, 232],
  [0, 348],
  [0, 464],
];
const AMBER: [number, number] = [232, 116];

/** Größen über Abstands-Tokens (Mindesthöhe: Symbol 20 px, Wortmarke 16 px). */
const SIZES = { sm: 'var(--space-6)', md: 'var(--space-8)', lg: 'var(--space-12)' } as const;

export interface LogoProps {
  /** Auf Nacht- und Kobaltflächen: Symbol Creme, "PRO" Amber, "fessor" Creme. */
  onNight?: boolean;
  /** Nur das Raster-P (z. B. App-Icon-Größe, enge Räume). */
  symbolOnly?: boolean;
  size?: keyof typeof SIZES;
  /** Name für Screenreader, wenn nur das Symbol steht. */
  label?: string;
  className?: string;
}

/**
 * Logo PROfessor (Design System, pf-logo): Raster-P und Wortmarke in Bricolage Grotesque 800. Die Wortmarke ist
 * Live-Text, bis sie als Pfad vorliegt (Audit E10). Nie umfärben, drehen oder mit Punkt schreiben.
 */
export function Logo({
  onNight,
  symbolOnly,
  size = 'md',
  label = 'PROfessor',
  className,
}: LogoProps) {
  const fontSize = SIZES[size];
  const tile = onNight ? 'fill-creme' : 'fill-brand';
  return (
    <span className={cn('pf-logo', onNight && 'pf-logo--night', className)} style={{ fontSize }}>
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 332 564"
        role={symbolOnly ? 'img' : undefined}
        aria-label={symbolOnly ? label : undefined}
        aria-hidden={symbolOnly ? undefined : true}
      >
        {TILES.map(([x, y]) => (
          <rect key={`${x}-${y}`} x={x} y={y} width="100" height="100" rx="22" className={tile} />
        ))}
        <rect x={AMBER[0]} y={AMBER[1]} width="100" height="100" rx="22" className="fill-signal" />
      </svg>
      {symbolOnly ? null : (
        <span className="pf-logo__word" style={{ fontSize }}>
          <b>PRO</b>fessor
        </span>
      )}
    </span>
  );
}
