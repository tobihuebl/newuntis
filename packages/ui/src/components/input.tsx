import * as React from 'react';
import { cn } from '../cn';
import { FieldShell, describedBy } from './field';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  /** Sichtbare Beschriftung; jedes Feld braucht eine (WCAG 2.2 AA). */
  label: string;
  error?: string;
  /** Erklärung unter dem Feld, per aria-describedby verknüpft. */
  hint?: string;
  /** Codes, Räume, Zeiten in JetBrains Mono. */
  mono?: boolean;
  /** Beschriftung nur für Screenreader (z. B. in Tabellenzeilen). */
  hideLabel?: boolean;
  /** Klassen für den äußeren Rahmen (Beschriftung, Feld, Hinweise). */
  fieldClassName?: string;
}

/** Eingabefeld (Design System, pf-input): 52 px hoch, 16 px Schrift (kein iOS-Zoom). */
export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, hint, mono, hideLabel, fieldClassName, className, id, ...props }, ref) => {
    const autoId = React.useId();
    const inputId = id ?? autoId;
    return (
      <FieldShell
        id={inputId}
        label={label}
        hint={hint}
        error={error}
        hideLabel={hideLabel}
        className={fieldClassName}
      >
        <input
          ref={ref}
          id={inputId}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy(inputId, hint, error)}
          className={cn('pf-input', mono && 'pf-num font-data', className)}
          {...props}
        />
      </FieldShell>
    );
  },
);
Input.displayName = 'Input';
