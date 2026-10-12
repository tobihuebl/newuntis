import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { LoaderCircle, type LucideIcon } from 'lucide-react';
import { cn } from '../cn';

/**
 * Button (Design System, pf-btn): Primär Kobalt mit Taster-Kante, Amber nur für Aufmerksamkeit, Danger erst im
 * Bestätigungs-Sheet. Mindesthöhe 48 px (sm 40 px nur in Tabellen am Desktop). Beschriftung: ein Verb, max. drei Wörter.
 */
export const buttonVariants = cva('pf-btn', {
  variants: {
    variant: {
      primary: 'pf-btn--primary',
      signal: 'pf-btn--signal',
      secondary: 'pf-btn--secondary',
      ghost: 'pf-btn--ghost',
      danger: 'pf-btn--danger',
    },
    size: { md: '', sm: 'pf-btn--sm', lg: 'pf-btn--lg' },
    block: { true: 'pf-btn--block', false: '' },
  },
  defaultVariants: { variant: 'primary', size: 'md', block: false },
});

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  /** Lucide-Icon links neben der Beschriftung. */
  iconLeft?: LucideIcon;
  /** Zeigt einen Ladezustand und sperrt den Button (aria-busy). */
  loading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant,
      size,
      block,
      asChild = false,
      iconLeft: Icon,
      loading = false,
      disabled,
      type,
      children,
      ...props
    },
    ref,
  ) => {
    const classes = cn(buttonVariants({ variant, size, block }), className);
    if (asChild) {
      return (
        <Slot ref={ref} className={classes} {...props}>
          {children}
        </Slot>
      );
    }
    return (
      <button
        ref={ref}
        type={type ?? 'button'}
        className={classes}
        disabled={disabled || loading}
        aria-busy={loading || undefined}
        {...props}
      >
        {loading ? (
          <LoaderCircle aria-hidden="true" className="animate-spin" />
        ) : Icon ? (
          <Icon aria-hidden="true" />
        ) : null}
        {children}
      </button>
    );
  },
);
Button.displayName = 'Button';
