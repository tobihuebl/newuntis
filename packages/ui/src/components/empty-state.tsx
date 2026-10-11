import * as React from 'react';

export interface EmptyStateProps {
  title: string;
  description?: string;
  /** Nächste Aktion, z. B. eine Schaltfläche. */
  action?: React.ReactNode;
}

export function EmptyState({ title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center gap-2 px-4 py-12 text-center">
      <h2 className="text-lg font-semibold text-text">{title}</h2>
      {description ? <p className="max-w-prose text-muted">{description}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}
