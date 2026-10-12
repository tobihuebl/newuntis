import * as React from 'react';
import { cn } from '../cn';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  /** Sichtbare Beschriftung; jedes Feld braucht eine (WCAG 2.2 AA). */
  label: string;
  error?: string;
  /** Erklärung unter dem Feld, per aria-describedby verknüpft. */
  hint?: string;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, hint, className, id, ...props }, ref) => {
    const autoId = React.useId();
    const inputId = id ?? autoId;
    const errorId = `${inputId}-error`;
    const hintId = `${inputId}-hint`;
    const describedBy = [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(' ');
    return (
      <div className="flex flex-col gap-1">
        <label htmlFor={inputId} className="text-sm font-medium text-text">
          {label}
        </label>
        <input
          ref={ref}
          id={inputId}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy || undefined}
          className={cn(
            'min-h-11 rounded-sm border border-border bg-surface-2 px-3 text-text placeholder:text-muted',
            error && 'border-danger',
            className,
          )}
          {...props}
        />
        {hint ? (
          <p id={hintId} className="text-sm text-muted">
            {hint}
          </p>
        ) : null}
        {error ? (
          <p id={errorId} className="text-sm text-danger">
            {error}
          </p>
        ) : null}
      </div>
    );
  },
);
Input.displayName = 'Input';
