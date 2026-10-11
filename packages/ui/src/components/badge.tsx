import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../cn';

const badgeVariants = cva(
  'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium',
  {
    variants: {
      tone: {
        neutral: 'border-border bg-surface-2 text-text',
        success: 'border-success text-success',
        warning: 'border-warning text-warning',
        danger: 'border-danger text-danger',
        info: 'border-info text-info',
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
