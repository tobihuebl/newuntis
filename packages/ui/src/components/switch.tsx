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

/** Schalter (role="switch"): ganze Zeile 44 px, Zustand nie nur über Farbe (Knopfposition). */
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
        'inline-flex min-h-11 items-center gap-3 text-left text-ink disabled:opacity-50',
        className,
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          'relative inline-flex h-6 w-11 shrink-0 rounded-full border-2 transition-colors duration-150',
          checked ? 'border-brand bg-brand' : 'border-line bg-bg-sunken',
        )}
      >
        <span
          className={cn(
            'absolute top-0.5 h-4 w-4 rounded-full transition-transform duration-150',
            checked ? 'translate-x-5 bg-on-brand' : 'translate-x-0.5 bg-line-strong',
          )}
        />
      </span>
      <span className={cn(hideLabel && 'sr-only')}>{label}</span>
    </button>
  );
}
