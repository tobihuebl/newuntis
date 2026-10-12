import * as React from 'react';
import { Check } from 'lucide-react';
import { cn } from '../cn';

export interface CheckboxProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label: string;
  hint?: string;
}

/**
 * Checkbox aus Tokens abgeleitet (nicht im Design System, Vorschlag in docs/design-audit.md): Rand line-strong
 * (3:1), gewählt brand mit Häkchen. Die ganze Zeile ist die Tippfläche (mindestens 44 px).
 */
export const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(
  ({ label, hint, className, id, ...props }, ref) => {
    const autoId = React.useId();
    const inputId = id ?? autoId;
    return (
      <label
        htmlFor={inputId}
        className={cn(
          'flex min-h-(--tap-min) cursor-pointer items-center gap-3 text-ink',
          className,
        )}
      >
        <span className="relative grid size-6 shrink-0 place-items-center">
          <input
            ref={ref}
            id={inputId}
            type="checkbox"
            aria-describedby={hint ? `${inputId}-hint` : undefined}
            className="peer size-6 cursor-pointer appearance-none rounded-xs bg-bg-raised ring-control checked:bg-brand checked:shadow-none disabled:cursor-not-allowed disabled:opacity-45"
            {...props}
          />
          <Check
            aria-hidden="true"
            strokeWidth={3}
            className="pointer-events-none absolute size-4 text-on-brand opacity-0 peer-checked:opacity-100"
          />
        </span>
        <span className="flex flex-col">
          <span>{label}</span>
          {hint ? (
            <span id={`${inputId}-hint`} className="text-body-sm text-ink-muted">
              {hint}
            </span>
          ) : null}
        </span>
      </label>
    );
  },
);
Checkbox.displayName = 'Checkbox';
