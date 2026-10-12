import * as React from 'react';
import { cn } from '../cn';

export interface SegmentedControlProps<T extends string> {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
  className?: string;
}

/** Auswahl aus wenigen Möglichkeiten als Radiogruppe (Tastatur: Pfeiltasten über native Radios). */
export function SegmentedControl<T extends string>({
  label,
  value,
  options,
  onChange,
  className,
}: SegmentedControlProps<T>) {
  const name = React.useId();
  return (
    <fieldset className={cn('flex flex-col gap-1', className)}>
      <legend className="mb-1 text-label text-ink">{label}</legend>
      <div className="inline-flex flex-wrap gap-1 rounded-sm border border-line bg-bg-sunken p-1">
        {options.map((o) => (
          <label
            key={o.value}
            className={cn(
              'relative inline-flex min-h-10 min-w-11 cursor-pointer items-center justify-center rounded-sm px-3 text-label has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-focus',
              value === o.value
                ? 'bg-bg-raised font-semibold text-ink ring-1 ring-line'
                : 'text-ink hover:bg-bg-raised',
            )}
          >
            <input
              type="radio"
              name={name}
              value={o.value}
              checked={value === o.value}
              onChange={() => onChange(o.value)}
              className="sr-only"
            />
            {o.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
