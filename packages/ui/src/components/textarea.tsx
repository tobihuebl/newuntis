import * as React from 'react';
import { cn } from '../cn';
import { FieldShell, describedBy } from './field';

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  /** Sichtbare Beschriftung; jedes Feld braucht eine (WCAG 2.2 AA). */
  label: string;
  error?: string;
  hint?: string;
  fieldClassName?: string;
}

/** Mehrzeiliges Feld im Stil von pf-input (Stoff, Hausübung, Nachrichten). */
export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ label, error, hint, fieldClassName, className, id, ...props }, ref) => {
    const autoId = React.useId();
    const inputId = id ?? autoId;
    return (
      <FieldShell id={inputId} label={label} hint={hint} error={error} className={fieldClassName}>
        <textarea
          ref={ref}
          id={inputId}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy(inputId, hint, error)}
          className={cn('pf-input min-h-28 py-3', className)}
          {...props}
        />
      </FieldShell>
    );
  },
);
Textarea.displayName = 'Textarea';
