import * as React from 'react';
import { cn } from '../cn';

export interface CheckboxProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label: string;
}

/** Die ganze Zeile ist die Tap-Fläche (mindestens 44 px hoch). */
export const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(
  ({ label, className, id, ...props }, ref) => {
    const autoId = React.useId();
    const inputId = id ?? autoId;
    return (
      <label
        htmlFor={inputId}
        className={cn('flex min-h-11 items-center gap-3 text-text', className)}
      >
        <input
          ref={ref}
          id={inputId}
          type="checkbox"
          className="size-5 accent-[var(--primary)]"
          {...props}
        />
        <span>{label}</span>
      </label>
    );
  },
);
Checkbox.displayName = 'Checkbox';
