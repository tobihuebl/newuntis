import * as React from 'react';
import { Check, Clock, X, FileCheck, Ban, UserRoundCog, DoorOpen } from 'lucide-react';
import { Badge } from './badge';
import { cn } from '../cn';

/** Status-Sprache (Spec Abschnitt 6): nie nur Farbe, immer Icon und Text. */
export type Status =
  'present' | 'late' | 'absent' | 'excused' | 'cancelled' | 'substituted' | 'roomChanged';

const CONFIG = {
  present: { tone: 'success', Icon: Check, strike: false },
  late: { tone: 'warning', Icon: Clock, strike: false },
  absent: { tone: 'danger', Icon: X, strike: false },
  excused: { tone: 'info', Icon: FileCheck, strike: false },
  cancelled: { tone: 'danger', Icon: Ban, strike: true },
  substituted: { tone: 'warning', Icon: UserRoundCog, strike: false },
  roomChanged: { tone: 'info', Icon: DoorOpen, strike: false },
} as const;

export interface StatusBadgeProps {
  status: Status;
  /** Lokalisierter Text; kommt aus den i18n-Dateien der App. */
  label: string;
  className?: string;
}

export function StatusBadge({ status, label, className }: StatusBadgeProps) {
  const { tone, Icon, strike } = CONFIG[status];
  return (
    <Badge tone={tone} className={className} data-status={status}>
      <Icon aria-hidden="true" size={14} />
      <span className={cn(strike && 'line-through')}>{label}</span>
    </Badge>
  );
}
