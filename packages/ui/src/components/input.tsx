import * as React from 'react';
import { cn } from '../cn';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  /** Sichtbare Beschriftung; jedes Feld braucht eine (WCAG 2.2 AA). */
  label: string;
  error?: string;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, className, id, ...props }, ref) => {
    const autoId = React.useId();
    const inputId = id ?? autoId;
    const errorId = `${inputId}-error`;
    return (
      <div className="flex flex-col gap-1">
        <label htmlFor={inputId} className="text-sm font-medium text-text">
          {label}
        </label>
        <input
          ref={ref}
          id={inputId}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          className={cn(
            'min-h-11 rounded-sm border border-border bg-surface-2 px-3 text-text placeholder:text-muted',
            error && 'border-danger',
            className,
          )}
          {...props}
        />
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
