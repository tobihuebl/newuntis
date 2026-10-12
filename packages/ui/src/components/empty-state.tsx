import * as React from 'react';
import { cn } from '../cn';

export interface EmptyStateProps {
  title: string;
  /** Ein Satz: warum nichts da ist und was als Nächstes geschieht. */
  description?: string;
  /** Nächste Aktion, z. B. eine Schaltfläche. */
  action?: React.ReactNode;
  /** Überschriftenebene passend zur Seite. */
  as?: 'h2' | 'h3' | 'h4';
  className?: string;
}

/** Leerzustand (Design System, pf-empty): Kachel-Raster statt Illustration, positive Sprache. */
export function EmptyState({ title, description, action, as: Tag = 'h2', className }: EmptyStateProps) {
  return (
    <div className={cn('pf-empty', className)}>
      <div className="pf-empty__tiles" aria-hidden="true">
        <i />
        <i className="a" />
        <i />
        <i className="b" />
        <i />
        <i />
        <i />
        <i />
        <i className="a" />
      </div>
      <Tag className="pf-card__title">{title}</Tag>
      {description ? <p className="pf-card__sub max-w-prose">{description}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}
