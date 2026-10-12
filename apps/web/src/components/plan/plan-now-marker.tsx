'use client';
import { cn } from '@sp/ui';
import { clockMinutes, useNow, viennaDate, viennaMinutes } from '../../lib/now';

const timeFmt = new Intl.DateTimeFormat('de-AT', {
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Europe/Vienna',
});

/**
 * Zeitlinie im Wochenraster: über die ganze Woche dünn, in der Spalte von heute kräftig; anteilig in der
 * laufenden Stunde oder an der Grenze zur nächsten (Pause). Die Uhrzeit steht in der Zeitspalte, damit sie
 * keine Stunde verdeckt. Außerhalb der Unterrichtszeit unsichtbar.
 */
export function PlanNowMarker({
  days,
  periods,
}: {
  days: string[];
  periods: { number: number; startTime: string; endTime: string }[];
}) {
  const now = useNow();
  if (now === null || periods.length === 0) return null;
  const col = days.indexOf(viennaDate(now));
  if (col < 0) return null;
  const m = viennaMinutes(now);
  let row = -1;
  let top = '0%';
  for (let i = 0; i < periods.length; i++) {
    const start = clockMinutes(periods[i]!.startTime);
    const end = clockMinutes(periods[i]!.endTime);
    if (m >= start && m < end) {
      row = i;
      top = `${((m - start) / (end - start)) * 100}%`;
      break;
    }
    const prevEnd = i === 0 ? start - 60 : clockMinutes(periods[i - 1]!.endTime);
    if (m < start && m >= prevEnd) {
      row = i; // Pause vor dieser Stunde (bzw. die Stunde vor Unterrichtsbeginn)
      break;
    }
  }
  if (row < 0) return null;
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none relative z-10"
      style={{ gridColumn: '1 / -1', gridRow: row + 2 }}
    >
      <div
        data-now-line=""
        className="absolute inset-x-0 grid items-center gap-x-1"
        style={{
          top,
          transform: 'translateY(-50%)',
          gridTemplateColumns: '4.5rem repeat(5, minmax(0, 1fr))',
        }}
      >
        <span className="justify-self-end rounded-full bg-brand px-1.5 text-[11px] font-semibold leading-4 text-on-brand tabular-nums">
          {timeFmt.format(new Date(now))}
        </span>
        {days.map((d, i) => (
          <span key={d} className="flex items-center">
            {i === col ? (
              <span className="-ml-1 h-2.5 w-2.5 shrink-0 rounded-full bg-brand" />
            ) : null}
            <span
              className={cn(
                'flex-1',
                i === col ? 'h-0.5 bg-brand' : 'h-px bg-brand opacity-30',
              )}
            />
          </span>
        ))}
      </div>
    </div>
  );
}
