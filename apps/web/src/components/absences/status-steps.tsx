'use client';
import { cn } from '@sp/ui';
import { useT } from '../../lib/i18n';

export type AbsenceStep = 'reported' | 'reminder' | 'reviewed' | 'excused';
const STEPS: AbsenceStep[] = ['reported', 'reminder', 'reviewed', 'excused'];

/**
 * Status-Verlauf einer Meldung als vier Kacheln (Design System, Abwesenheit melden): Gemeldet, Erinnerung, Geprüft,
 * Entschuldigt. Erledigte Schritte Kobalt, der aktuelle zusätzlich mit Wort für Screenreader.
 */
export function StatusSteps({ current }: { current: AbsenceStep }) {
  const t = useT('absence');
  const at = STEPS.indexOf(current);
  return (
    <ol className="grid grid-cols-4 gap-2" aria-label={t('steps.label')}>
      {STEPS.map((s, i) => (
        <li
          key={s}
          aria-current={i === at ? 'step' : undefined}
          className={cn(
            'flex min-h-14 flex-col justify-end rounded-md p-2 text-caption',
            i <= at ? 'bg-brand text-on-brand' : 'bg-bg-sunken text-ink-muted',
          )}
        >
          {t(`steps.${s}`)}
        </li>
      ))}
    </ol>
  );
}
