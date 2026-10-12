'use client';
import { useEffect, useState } from 'react';

const TZ = 'Europe/Vienna';

/**
 * Aktuelle Zeit, regelmäßig aktualisiert. Vor dem ersten Effekt `null`, damit Server- und Client-Rendering
 * übereinstimmen (die Zeitlinie erscheint erst im Browser).
 */
export function useNow(intervalMs = 30_000): number | null {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}

/** Kalendertag in Wien als "YYYY-MM-DD". */
export const viennaDate = (ms: number) =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(ms));

/** Minuten seit Mitternacht in Wien. */
export function viennaMinutes(ms: number): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: TZ,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(ms));
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  return get('hour') * 60 + get('minute');
}

/** "08:50" in Minuten. */
export const clockMinutes = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
};

/**
 * Wo steht "jetzt" relativ zu einem Zeitraum? `inside` mit Anteil 0..1, `before` (Lücke davor, z. B. Pause)
 * oder nichts. Reine Funktion, getestet.
 */
export function nowPlacement(
  now: number,
  start: number,
  end: number,
  previousEnd: number | null,
): { kind: 'inside'; progress: number } | { kind: 'before' } | null {
  if (now >= start && now < end) return { kind: 'inside', progress: (now - start) / (end - start) };
  if (now < start && (previousEnd === null || now >= previousEnd)) return { kind: 'before' };
  return null;
}
