'use client';
import * as React from 'react';
import { Check, Clock, X } from 'lucide-react';
import { Chip } from './chip';
import { cn } from '../cn';

export type AttendanceState = 'present' | 'late' | 'absent';

const CHIP = {
  present: { tone: 'ok', icon: Check },
  late: { tone: 'late', icon: Clock },
  absent: { tone: 'absent', icon: X },
} as const;

/** Ab dieser Dauer gilt ein Druck als lang (Verspätungs-Sheet). */
export const LONG_PRESS_MS = 500;

export interface AttendanceRowProps {
  name: string;
  /** Initial für den Avatar. */
  initial: string;
  status: AttendanceState;
  /** Wort im Chip, z. B. "Anwesend" oder "5 Min spät". */
  statusLabel: string;
  /** Beschriftung für Screenreader, z. B. "Anna Berger: Anwesend. Tippen wechselt." */
  toggleLabel: string;
  /** Sichtbare Alternative zum langen Drücken (Verspätung eintragen). */
  lateLabel: string;
  /** Hinweis "wartet" bei offline gespeicherten Änderungen. */
  pendingLabel?: string;
  disabled?: boolean;
  onToggle: () => void;
  onLate: () => void;
  className?: string;
  /** Daten-Attribute für Tests und Offline-Abgleich. */
  data?: Record<`data-${string}`, string>;
}

/**
 * Klassenbuch-Zeile (Design System, pf-att): ein Tap wechselt anwesend/abwesend, langes Drücken öffnet die
 * Verspätung; daneben eine sichtbare Taste dafür. Mindestens 56 px hoch, Status immer als Chip mit Wort.
 */
export function AttendanceRow({
  name,
  initial,
  status,
  statusLabel,
  toggleLabel,
  lateLabel,
  pendingLabel,
  disabled,
  onToggle,
  onLate,
  className,
  data,
}: AttendanceRowProps) {
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressed = React.useRef(false);
  const cancel = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };
  const chip = CHIP[status];
  return (
    <li className={cn('flex items-center gap-2', className)} data-status={status} {...data}>
      <button
        type="button"
        disabled={disabled}
        aria-label={toggleLabel}
        className={cn(
          'pf-att select-none disabled:cursor-default',
          status === 'absent' && 'bg-neutral-soft',
          status === 'late' && 'bg-signal-soft',
        )}
        onPointerDown={() => {
          longPressed.current = false;
          cancel();
          timer.current = setTimeout(() => {
            longPressed.current = true;
            onLate();
          }, LONG_PRESS_MS);
        }}
        onPointerUp={cancel}
        onPointerLeave={cancel}
        onPointerCancel={cancel}
        onContextMenu={(e) => e.preventDefault()}
        onClick={() => {
          if (longPressed.current) {
            longPressed.current = false;
            return;
          }
          onToggle();
        }}
      >
        <span className="pf-att__avatar" aria-hidden="true">
          {initial}
        </span>
        <span className="pf-att__name min-w-0 truncate">{name}</span>
        {pendingLabel ? (
          <span className="flex items-center gap-1 text-caption text-ink-muted">
            <span aria-hidden="true" className="size-2 rounded-pill bg-signal" />
            {pendingLabel}
          </span>
        ) : null}
        <Chip tone={chip.tone} icon={chip.icon} className="shrink-0">
          {statusLabel}
        </Chip>
      </button>
      {disabled ? null : (
        <button
          type="button"
          onClick={onLate}
          aria-label={lateLabel}
          className="inline-flex size-14 shrink-0 items-center justify-center rounded-md bg-bg-sunken text-ink-muted hover:bg-signal-soft hover:text-signal-ink"
        >
          <Clock aria-hidden="true" className="size-5" />
        </button>
      )}
    </li>
  );
}
