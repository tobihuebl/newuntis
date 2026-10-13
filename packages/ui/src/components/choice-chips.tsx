import * as React from 'react';
import { Check } from 'lucide-react';
import { cn } from '../cn';

export interface ChoiceChipsProps<T extends string> {
  label: string;
  options: { value: T; label: string }[];
  value: T[];
  onChange: (value: T[]) => void;
  className?: string;
}

/**
 * Mehrfachauswahl als Chips (Design System, Rundschreiben: Zielgruppe als Chips). Native Checkboxen in einem
 * Fieldset, gewählt brand-soft mit Haken, sonst Rand line-strong; jede Pille mindestens 44 px hoch.
 */
export function ChoiceChips<T extends string>({
  label,
  options,
  value,
  onChange,
  className,
}: ChoiceChipsProps<T>) {
  return (
    <fieldset className={cn('flex min-w-0 flex-col gap-1.5', className)}>
      <legend className="mb-1.5 text-label text-ink">{label}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => {
          const on = value.includes(o.value);
          return (
            <label
              key={o.value}
              className={cn(
                'relative inline-flex min-h-(--tap-min) cursor-pointer items-center gap-1.5 rounded-pill px-4 text-label transition-colors duration-150 has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-offset-3 has-[:focus-visible]:outline-focus',
                on ? 'bg-brand-soft text-brand-text' : 'text-ink ring-control hover:bg-bg-sunken',
              )}
            >
              <input
                type="checkbox"
                checked={on}
                onChange={() =>
                  onChange(on ? value.filter((v) => v !== o.value) : [...value, o.value])
                }
                className="absolute inset-0 m-0 cursor-pointer appearance-none rounded-pill opacity-0"
              />
              {on ? <Check aria-hidden="true" className="size-4" /> : null}
              {o.label}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
