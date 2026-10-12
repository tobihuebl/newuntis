import * as React from 'react';
import { Ban, Check, Clock, DoorOpen, FileCheck, UserRoundCog, X } from 'lucide-react';
import { Chip, type ChipTone } from './chip';
import { cn } from '../cn';

/**
 * Fachliche Zustände als Chip (Design System "Status auf einen Blick", Abbildung in docs/design-audit.md 2a):
 * Rot gibt es nur für Fehler, deshalb sind abwesend neutral und Entfall ein Hinweis.
 */
export type Status =
  | 'present'
  | 'late'
  | 'absent'
  | 'excused'
  | 'cancelled'
  | 'substituted'
  | 'roomChanged';

const CONFIG: Record<Status, { tone: ChipTone; Icon: typeof Check; strike: boolean }> = {
  present: { tone: 'ok', Icon: Check, strike: false },
  late: { tone: 'late', Icon: Clock, strike: false },
  absent: { tone: 'absent', Icon: X, strike: false },
  excused: { tone: 'ok', Icon: FileCheck, strike: false },
  cancelled: { tone: 'late', Icon: Ban, strike: true },
  substituted: { tone: 'ok', Icon: UserRoundCog, strike: false },
  roomChanged: { tone: 'late', Icon: DoorOpen, strike: false },
};

export interface StatusBadgeProps {
  status: Status;
  /** Lokalisierter Text; kommt aus den i18n-Dateien der App. */
  label: string;
  className?: string;
}

export function StatusBadge({ status, label, className }: StatusBadgeProps) {
  const { tone, Icon, strike } = CONFIG[status];
  return (
    <Chip tone={tone} icon={Icon} className={className} data-status={status}>
      <span className={cn(strike && 'line-through')}>{label}</span>
    </Chip>
  );
}
