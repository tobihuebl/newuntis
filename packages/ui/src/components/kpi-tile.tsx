import * as React from 'react';
import { cn } from '../cn';

export interface KpiTileProps extends Omit<React.HTMLAttributes<HTMLElement>, 'children'> {
  /** Ganzzahl (tabellarische Ziffern) oder kurze Angabe wie "96 %". */
  value: React.ReactNode;
  /** Substantiv im Plural; steht im selben Element wie die Zahl ("3 Supplierungen"). */
  label: string;
  /** signal nur für Zahlen, die Handlung verlangen (Kollisionen, Fristen). */
  tone?: 'brand' | 'signal';
  /** big (64 px) höchstens einmal je Dashboard. */
  size?: 'md' | 'big';
  /** Element, z. B. next/link; jede Kennzahl führt in die gefilterte Liste dahinter. */
  as?: React.ElementType;
  href?: string;
}

/** Kennzahl-Kachel (Design System, pf-kpi): Zahl groß, Wort daneben. */
export function KpiTile({
  value,
  label,
  tone = 'brand',
  size = 'md',
  as,
  className,
  ...props
}: KpiTileProps) {
  const Comp = as ?? (props.href ? 'a' : 'div');
  return (
    <Comp
      className={cn(
        'pf-kpi',
        tone === 'signal' && 'pf-kpi--signal',
        size === 'big' && 'pf-kpi--big',
        props.href && 'pf-focusable text-ink no-underline hover:shadow-card',
        className,
      )}
      {...props}
    >
      <span className="pf-kpi__num">{value}</span>{' '}
      <span className="pf-kpi__label">{label}</span>
    </Comp>
  );
}
