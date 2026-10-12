import * as React from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '../cn';

export interface BannerProps extends React.HTMLAttributes<HTMLDivElement> {
  /** signal: Hinweis/Offline (Standard), danger: Systemfehler, brand: Information oder fehlende Berechtigung. */
  tone?: 'signal' | 'danger' | 'brand';
  icon?: LucideIcon;
  /** Aktion rechts, z. B. "Erneut versuchen". */
  action?: React.ReactNode;
}

/** Banner (Design System, pf-banner): dauerhafter Zustand am Ort, z. B. offline mit Anzahl wartender Einträge. */
export function Banner({
  tone = 'signal',
  icon: Icon,
  action,
  className,
  children,
  ...props
}: BannerProps) {
  return (
    <div
      className={cn(
        'pf-banner flex-wrap',
        tone === 'danger' && 'bg-danger-soft text-danger-ink',
        tone === 'brand' && 'bg-brand-soft text-ink',
        className,
      )}
      {...props}
    >
      {Icon ? <Icon aria-hidden="true" /> : null}
      <div className="min-w-48 flex-1">{children}</div>
      {action ? <div className="shrink-0 max-sm:ml-auto">{action}</div> : null}
    </div>
  );
}
