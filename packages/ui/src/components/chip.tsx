import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import type { LucideIcon } from 'lucide-react';
import { cn } from '../cn';

/**
 * Chip (Design System, pf-chip): ein Zustand in einem Wort, immer mit Icon; Farbe trägt nie allein die Bedeutung.
 * ok = anwesend/erledigt/Vertretung, late = verspätet/Frist/Hinweis, absent = abwesend/Entwurf/inaktiv,
 * danger = Fehler, solid = der eine Konflikt je Ansicht, mono = Zeiten und Räume. Nicht tippbar.
 */
export const chipVariants = cva('pf-chip', {
  variants: {
    tone: {
      neutral: '',
      ok: 'pf-chip--ok',
      late: 'pf-chip--late',
      absent: 'pf-chip--absent',
      danger: 'pf-chip--danger',
      solid: 'pf-chip--solid',
      mono: 'pf-chip--mono',
    },
  },
  defaultVariants: { tone: 'neutral' },
});

export type ChipTone = NonNullable<VariantProps<typeof chipVariants>['tone']>;

export interface ChipProps
  extends React.HTMLAttributes<HTMLSpanElement>, VariantProps<typeof chipVariants> {
  icon?: LucideIcon;
}

export function Chip({ tone, icon: Icon, className, children, ...props }: ChipProps) {
  return (
    <span className={cn(chipVariants({ tone }), className)} data-tone={tone ?? 'neutral'} {...props}>
      {Icon ? <Icon aria-hidden="true" /> : null}
      {children}
    </span>
  );
}
