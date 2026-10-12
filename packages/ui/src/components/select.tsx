import * as React from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '../cn';
import { FieldShell, describedBy } from './field';

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
  hint?: string;
  hideLabel?: boolean;
  fieldClassName?: string;
}

/** Native Auswahl im Stil von pf-input (barrierearm, mobil mit Systemauswahl). */
export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  (
    { label, options, emptyLabel, error, hint, hideLabel, fieldClassName, className, id, ...props },
    ref,
  ) => {
    const autoId = React.useId();
    const selectId = id ?? autoId;
    return (
      <FieldShell
        id={selectId}
        label={label}
        hint={hint}
        error={error}
        hideLabel={hideLabel}
        className={fieldClassName}
      >
        <div className="relative">
          <select
            ref={ref}
            id={selectId}
            aria-invalid={error ? true : undefined}
            aria-describedby={describedBy(selectId, hint, error)}
            className={cn('pf-input cursor-pointer pr-12', className)}
            {...props}
          >
            {emptyLabel !== undefined ? <option value="">{emptyLabel}</option> : null}
            {options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <ChevronDown
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 right-4 size-5 -translate-y-1/2 text-ink-muted"
          />
        </div>
      </FieldShell>
    );
  },
);
Select.displayName = 'Select';
