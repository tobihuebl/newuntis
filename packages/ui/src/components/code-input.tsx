'use client';
import * as React from 'react';
import { cn } from '../cn';
import { FieldShell, describedBy } from './field';

export interface CodeInputProps {
  label: string;
  name?: string;
  length?: number;
  error?: string;
  hint?: string;
  disabled?: boolean;
  autoFocus?: boolean;
  /** Nach der letzten Ziffer (Design System: Autosubmit nach der sechsten Ziffer). */
  onComplete?: (code: string) => void;
}

/**
 * Code-Eingabe für die Zwei-Faktor-Anmeldung (Design System, Anmeldung): sechs Mono-Felder à 52 px. Technisch ein
 * einziges Eingabefeld, darum funktionieren Einfügen, Autofill (one-time-code) und Screenreader wie gewohnt.
 */
export function CodeInput({
  label,
  name = 'code',
  length = 6,
  error,
  hint,
  disabled,
  autoFocus,
  onComplete,
}: CodeInputProps) {
  const id = React.useId();
  const [value, setValue] = React.useState('');
  const [focused, setFocused] = React.useState(false);
  return (
    <FieldShell id={id} label={label} hint={hint} error={error}>
      <div className="relative">
        <input
          id={id}
          name={name}
          value={value}
          disabled={disabled}
          autoFocus={autoFocus}
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]*"
          maxLength={length}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy(id, hint, error)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onChange={(e) => {
            const v = e.target.value.replace(/\D/g, '').slice(0, length);
            setValue(v);
            if (v.length === length) onComplete?.(v);
          }}
          className="absolute inset-0 z-10 h-full w-full cursor-text opacity-0"
        />
        <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${length}, minmax(0, 1fr))` }}>
          {Array.from({ length }, (_, i) => (
            <span
              key={i}
              aria-hidden="true"
              className={cn(
                'pf-input flex items-center justify-center px-0 font-data text-h3',
                error && 'ring-field-error',
                focused &&
                  (i === Math.min(value.length, length - 1)
                    ? 'ring-field-focus'
                    : ''),
              )}
            >
              {value[i] ?? ''}
            </span>
          ))}
        </div>
      </div>
    </FieldShell>
  );
}
