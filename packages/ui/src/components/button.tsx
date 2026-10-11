import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../cn';

export const buttonVariants = cva(
  'inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-sm px-4 text-sm font-medium transition-colors duration-150 disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        primary: 'bg-primary text-on-primary hover:opacity-90',
        secondary: 'border border-border bg-surface text-text hover:bg-surface-2',
        ghost: 'text-text hover:bg-surface-2',
        destructive: 'bg-danger text-on-primary hover:opacity-90',
      },
    },
    defaultVariants: { variant: 'primary' },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, asChild = false, type, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return (
      <Comp
        ref={ref}
        type={asChild ? undefined : (type ?? 'button')}
        className={cn(buttonVariants({ variant }), className)}
        {...props}
      />
    );
  },
);
Button.displayName = 'Button';
