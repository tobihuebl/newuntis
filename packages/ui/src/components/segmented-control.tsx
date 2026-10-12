import * as React from 'react';
import { cn } from '../cn';

export interface SegmentedControlProps<T extends string> {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
  hideLabel?: boolean;
  className?: string;
}

/**
 * Auswahl aus wenigen Möglichkeiten als Radiogruppe (Tastatur: Pfeiltasten über native Radios). Aus Tokens
 * abgeleitet: Track bg-sunken mit Rand line-strong, Segmente als Pille, gewählt bg-raised mit Kartenschatten.
 */
export function SegmentedControl<T extends string>({
  label,
  value,
  options,
  onChange,
  hideLabel,
  className,
}: SegmentedControlProps<T>) {
  const name = React.useId();
  return (
    <fieldset className={cn('flex min-w-0 flex-col gap-1.5', className)}>
      <legend className={cn('mb-1.5 text-label text-ink', hideLabel && 'sr-only')}>{label}</legend>
      <div className="inline-flex max-w-full flex-wrap gap-1 self-start rounded-pill bg-bg-sunken p-1 ring-control">
        {options.map((o) => {
          const active = value === o.value;
          return (
            <label
              key={o.value}
              className={cn(
                'relative inline-flex min-h-10 min-w-(--tap-min) cursor-pointer items-center justify-center rounded-pill px-4 text-label transition-colors duration-150 has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-offset-3 has-[:focus-visible]:outline-focus',
                active ? 'bg-bg-raised text-ink shadow-card' : 'text-ink-muted hover:text-ink',
              )}
            >
              <input
                type="radio"
                name={name}
                value={o.value}
                checked={active}
                onChange={() => onChange(o.value)}
                className="sr-only"
              />
              {o.label}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
