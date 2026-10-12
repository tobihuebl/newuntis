import * as React from 'react';
import { cn } from '../cn';

export interface ListRowProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'title'> {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  leading?: React.ReactNode;
  trailing?: React.ReactNode;
}

/** Listenzeile (aus Tokens abgeleitet): mindestens 56 px, Trennung durch Haarlinie line, Name body-strong. */
export function ListRow({ title, subtitle, leading, trailing, className, ...props }: ListRowProps) {
  return (
    <div
      className={cn(
        'flex min-h-14 items-center gap-3 border-b border-line px-4 py-2 last:border-b-0',
        className,
      )}
      {...props}
    >
      {leading}
      <div className="min-w-0 flex-1">
        <div className="truncate text-body-strong text-ink">{title}</div>
        {subtitle ? <div className="truncate text-body-sm text-ink-muted">{subtitle}</div> : null}
      </div>
      {trailing}
    </div>
  );
}
