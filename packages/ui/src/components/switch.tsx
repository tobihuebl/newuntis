import * as React from 'react';
import { cn } from '../cn';

export interface SwitchProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  /** Sichtbare oder (bei Tabellen) nur für Screenreader gedachte Beschriftung. */
  label: string;
  hideLabel?: boolean;
  disabled?: boolean;
  className?: string;
}

/**
 * Schalter (role="switch", aus Tokens abgeleitet): Pille, aus mit Rand line-strong, an in brand. Zustand nie nur
 * über Farbe (Knopfposition). Ganze Zeile mindestens 44 px.
 */
export function Switch({
  checked,
  onCheckedChange,
  label,
  hideLabel,
  disabled,
  className,
}: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onCheckedChange(!checked)}
      className={cn(
        'inline-flex min-h-(--tap-min) items-center gap-3 rounded-md text-left text-ink disabled:cursor-not-allowed disabled:opacity-45',
        className,
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          'relative inline-flex h-8 w-13 shrink-0 rounded-pill transition-colors duration-150',
          checked ? 'bg-brand' : 'bg-bg-sunken ring-control',
        )}
      >
        <span
          className={cn(
            'absolute top-1 size-6 rounded-pill shadow-card transition-transform duration-150 ease-pf',
            checked ? 'translate-x-6 bg-on-brand' : 'translate-x-1 bg-ink-muted',
          )}
        />
      </span>
      <span className={cn(hideLabel && 'sr-only')}>{label}</span>
    </button>
  );
}
