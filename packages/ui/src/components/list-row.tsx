import * as React from 'react';
import { ChevronRight } from 'lucide-react';
import { cn } from '../cn';
import type { LinkComponent } from './navigation';

export interface ListRowProps extends Omit<React.HTMLAttributes<HTMLElement>, 'title'> {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  leading?: React.ReactNode;
  trailing?: React.ReactNode;
  /** In einer Liste (`ul`/`ol`) als `li`. */
  as?: 'div' | 'li';
  /** Ganze Zeile als Link (z. B. zur Detailseite); zeigt rechts einen Pfeil. */
  href?: string;
  linkAs?: LinkComponent;
}

const LAYOUT = 'flex min-h-14 items-center gap-3 px-4 py-2';
const DIVIDER = 'border-b border-line last:border-b-0';

/** Listenzeile (aus Tokens abgeleitet): mindestens 56 px, Trennung durch Haarlinie line, Name body-strong. */
export function ListRow({
  title,
  subtitle,
  leading,
  trailing,
  as: Outer = 'div',
  href,
  linkAs: Link = 'a',
  className,
  ...props
}: ListRowProps) {
  const body = (
    <>
      {leading}
      <div className="min-w-0 flex-1">
        <div className="truncate text-body-strong text-ink">{title}</div>
        {subtitle ? <div className="truncate text-body-sm text-ink-muted">{subtitle}</div> : null}
      </div>
      {trailing}
    </>
  );
  if (!href)
    return (
      <Outer className={cn(LAYOUT, DIVIDER, className)} {...props}>
        {body}
      </Outer>
    );
  return (
    <Outer className={DIVIDER} {...props}>
      <Link
        href={href}
        className={cn(
          LAYOUT,
          'pf-focusable text-ink no-underline transition-colors duration-150 hover:bg-brand-soft',
          className,
        )}
      >
        {body}
        <ChevronRight aria-hidden="true" className="size-5 shrink-0 text-ink-subtle" />
      </Link>
    </Outer>
  );
}
