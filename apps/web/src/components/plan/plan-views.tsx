'use client';
import { useEffect, useState } from 'react';
import { SegmentedControl, cn } from '@sp/ui';

const KEY = 'pf-plan-view';
type View = 'day' | 'week';

/**
 * Handy: zwischen Tagesliste und Wochenraster umschalten (die Wahl merkt sich das Gerät). Ab Tablet immer das
 * Wochenraster. Beide Ansichten rendert der Server; hier wird nur gewählt, welche sichtbar ist.
 */
export function PlanViews({
  label,
  dayLabel,
  weekLabel,
  day,
  week,
}: {
  label: string;
  dayLabel: string;
  weekLabel: string;
  day: React.ReactNode;
  week: React.ReactNode;
}) {
  const [view, setView] = useState<View>('day');
  useEffect(() => {
    try {
      if (localStorage.getItem(KEY) === 'week') setView('week');
    } catch {
      // ohne Speicher (privates Fenster): Tagesansicht
    }
  }, []);
  const choose = (v: View) => {
    setView(v);
    try {
      localStorage.setItem(KEY, v);
    } catch {
      // nur Bequemlichkeit
    }
  };
  return (
    <div className="flex flex-col gap-4">
      <SegmentedControl
        label={label}
        hideLabel
        className="md:hidden"
        value={view}
        onChange={choose}
        options={[
          { value: 'day', label: dayLabel },
          { value: 'week', label: weekLabel },
        ]}
      />
      <div className={cn(view === 'day' ? 'md:hidden' : 'hidden')}>{day}</div>
      <div className={cn(view === 'week' ? 'overflow-x-auto' : 'hidden md:block')}>{week}</div>
    </div>
  );
}
