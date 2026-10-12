import * as React from 'react';
import { TriangleAlert } from 'lucide-react';
import { cn } from '../cn';

/**
 * Gemeinsamer Rahmen der Eingabefelder (Design System, pf-field): Beschriftung sichtbar darüber, Hilfetext und
 * Fehler darunter, per aria-describedby verknüpft. Fehler mit Icon und Anweisung.
 */
export interface FieldShellProps {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  hideLabel?: boolean;
  className?: string;
  children: React.ReactNode;
}

export function describedBy(id: string, hint?: string, error?: string): string | undefined {
  return (
    [hint ? `${id}-hint` : null, error ? `${id}-error` : null].filter(Boolean).join(' ') ||
    undefined
  );
}

export function FieldShell({
  id,
  label,
  hint,
  error,
  hideLabel,
  className,
  children,
}: FieldShellProps) {
  return (
    <div className={cn('pf-field', className)}>
      <label htmlFor={id} className={cn('pf-field__label', hideLabel && 'sr-only')}>
        {label}
      </label>
      {children}
      {hint ? (
        <span id={`${id}-hint`} className="pf-field__hint">
          {hint}
        </span>
      ) : null}
      {error ? (
        <span id={`${id}-error`} className="pf-field__error">
          <TriangleAlert aria-hidden="true" />
          {error}
        </span>
      ) : null}
    </div>
  );
}
