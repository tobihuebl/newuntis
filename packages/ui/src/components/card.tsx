import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../cn';

/**
 * Karte (Design System, pf-card): gruppiert Zusammengehöriges. Höchstens eine Nachtkarte je Bildschirm (die
 * wichtigste Information), signal für Handlungsbedarf, brand für Information. Karten nie verschachteln.
 * Interaktive Karten sind ein einziger Link oder Button (asChild).
 */
export const cardVariants = cva('pf-card', {
  variants: {
    tone: { default: '', night: 'pf-card--night', signal: 'pf-card--signal', brand: 'pf-card--brand' },
    flat: { true: 'pf-card--flat', false: '' },
    interactive: { true: 'pf-card--interactive pf-focusable block', false: '' },
  },
  defaultVariants: { tone: 'default', flat: false, interactive: false },
});

export interface CardProps
  extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof cardVariants> {
  asChild?: boolean;
}

export const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ className, tone, flat, interactive, asChild, ...props }, ref) => {
    const Comp = asChild ? Slot : 'div';
    return (
      <Comp
        ref={ref}
        className={cn(cardVariants({ tone, flat, interactive }), className)}
        {...props}
      />
    );
  },
);
Card.displayName = 'Card';

export interface CardTitleProps extends React.HTMLAttributes<HTMLHeadingElement> {
  /** Überschriftenebene passend zur Seite (keine Sprünge). */
  as?: 'h2' | 'h3' | 'h4';
}

export function CardTitle({ as: Tag = 'h2', className, ...props }: CardTitleProps) {
  return <Tag className={cn('pf-card__title', className)} {...props} />;
}

export function CardSub({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn('pf-card__sub', className)} {...props} />;
}
