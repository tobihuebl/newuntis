import * as React from 'react';
import { cn } from '../cn';

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label: string;
  options: SelectOption[];
  /** Text der leeren Auswahl; ohne Angabe gibt es keine leere Option. */
  emptyLabel?: string;
  error?: string;
}

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ label, options, emptyLabel, error, className, id, ...props }, ref) => {
    const autoId = React.useId();
    const selectId = id ?? autoId;
    return (
      <div className="flex flex-col gap-1">
        <label htmlFor={selectId} className="text-label text-ink">
          {label}
        </label>
        <select
          ref={ref}
          id={selectId}
          aria-invalid={error ? true : undefined}
          className={cn(
            'min-h-11 rounded-sm border border-line bg-bg-sunken px-3 text-ink',
            error && 'border-danger',
            className,
          )}
          {...props}
        >
          {emptyLabel !== undefined ? <option value="">{emptyLabel}</option> : null}
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        {error ? <p className="text-body-sm text-danger-ink">{error}</p> : null}
      </div>
    );
  },
);
Select.displayName = 'Select';
