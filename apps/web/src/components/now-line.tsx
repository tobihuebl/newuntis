'use client';
import { useTranslations } from 'next-intl';
import { cn } from '@sp/ui';
import { nowPlacement, useNow } from '../lib/now';

const timeFmt = new Intl.DateTimeFormat('de-AT', {
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Europe/Vienna',
});

/** Die Linie selbst: Punkt, Strich und Uhrzeit. Liegt absolut im nächsten positionierten Element. */
export function NowLine({ top, now, className }: { top: string; now: number; className?: string }) {
  const t = useTranslations('today');
  const time = timeFmt.format(new Date(now));
  return (
    <div
      className={cn('pointer-events-none absolute inset-x-0 z-10 flex items-center', className)}
      style={{ top, transform: 'translateY(-50%)' }}
      data-now-line=""
    >
      <span aria-hidden="true" className="-ml-1 h-2.5 w-2.5 shrink-0 rounded-full bg-brand" />
      <span aria-hidden="true" className="h-0.5 flex-1 bg-brand" />
      <span className="ml-1 rounded-full bg-brand px-1.5 text-[11px] font-semibold leading-4 text-on-brand tabular-nums">
        <span className="sr-only">{t('nowAt')} </span>
        {time}
      </span>
    </div>
  );
}

/**
 * Zeitlinie in einer Tagesliste: in jede Zeile (position: relative) eingesetzt. Läuft die Stunde gerade,
 * steht die Linie anteilig in der Zeile; liegt "jetzt" in der Lücke davor (Pause), an der Oberkante.
 */
export function NowLineSlot({
  startsAt,
  endsAt,
  previousEndsAt,
}: {
  startsAt: string;
  endsAt: string;
  /** Ende der vorigen Stunde des Tages; null bei der ersten. */
  previousEndsAt: string | null;
}) {
  const now = useNow();
  if (now === null) return null;
  const place = nowPlacement(
    now,
    Date.parse(startsAt),
    Date.parse(endsAt),
    previousEndsAt ? Date.parse(previousEndsAt) : null,
  );
  if (!place) return null;
  // Vor der ersten Stunde des Tages nur am selben Tag (nicht schon am Vorabend) zeigen
  if (place.kind === 'before' && Date.parse(startsAt) - now > 3 * 3_600_000) return null;
  return <NowLine now={now} top={place.kind === 'inside' ? `${place.progress * 100}%` : '0%'} />;
}
