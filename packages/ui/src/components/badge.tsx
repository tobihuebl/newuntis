import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../cn';

const badgeVariants = cva(
  'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-caption',
  {
    variants: {
      tone: {
        neutral: 'border-line bg-bg-sunken text-ink',
        success: 'border-brand text-brand-text',
        warning: 'border-signal text-signal-ink',
        danger: 'border-danger text-danger-ink',
        info: 'border-brand text-brand-text',
      },
    },
    defaultVariants: { tone: 'neutral' },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}

export function Badge({ className, tone, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}
