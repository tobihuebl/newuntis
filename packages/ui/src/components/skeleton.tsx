'use client';
import * as React from 'react';
import { cn } from '../cn';

/**
 * Skeleton (Design System, pf-skel) in der Form des Inhalts. Erst ab 1 s Wartezeit sichtbar, davor unsichtbar
 * (der Platz bleibt reserviert, damit nichts springt). Ohne Bewegung bei prefers-reduced-motion.
 */
export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  const [visible, setVisible] = React.useState(false);
  React.useEffect(() => {
    const t = setTimeout(() => setVisible(true), 1000);
    return () => clearTimeout(t);
  }, []);
  return (
    <div
      aria-hidden="true"
      className={cn('pf-skel', !visible && 'invisible', className)}
      {...props}
    />
  );
}
