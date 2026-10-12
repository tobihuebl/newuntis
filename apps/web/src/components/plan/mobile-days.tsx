'use client';
import { useRef, useState } from 'react';
import { cn } from '@sp/ui';

/** Ab dieser waagrechten Strecke gilt eine Geste als Wischen zum nächsten Tag. */
const SWIPE = 60;

/**
 * Stundenplan mobil (Design System, Responsive Muster): ein Tag mit Zeitleiste, Wischen oder Tag-Tabs wechseln
 * den Tag. Die Tage rendert der Server; hier wird nur gewählt, welcher sichtbar ist.
 */
export function MobileDays({
  days,
  label,
  children,
}: {
  days: { key: string; label: string; current: boolean }[];
  label: string;
  children: React.ReactNode[];
}) {
  const initial = Math.max(
    0,
    days.findIndex((d) => d.current),
  );
  const [index, setIndex] = useState(initial);
  const start = useRef<{ x: number; y: number } | null>(null);
  const go = (i: number) => setIndex(Math.max(0, Math.min(days.length - 1, i)));

  return (
    <div className="flex flex-col gap-4 md:hidden">
      <div
        role="tablist"
        aria-label={label}
        className="grid grid-cols-5 gap-1 rounded-pill bg-bg-sunken p-1 ring-control"
      >
        {days.map((d, i) => (
          <button
            key={d.key}
            type="button"
            role="tab"
            id={`tab-${d.key}`}
            aria-selected={i === index}
            aria-controls={`panel-${d.key}`}
            onClick={() => go(i)}
            className={cn(
              'flex min-h-(--tap-min) flex-col items-center justify-center rounded-pill text-label',
              i === index ? 'bg-bg-raised text-ink shadow-card' : 'text-ink-muted',
              d.current && i !== index && 'text-brand-text',
            )}
          >
            {d.label}
          </button>
        ))}
      </div>
      {days.map((d, i) => (
        <div
          key={d.key}
          role="tabpanel"
          id={`panel-${d.key}`}
          aria-labelledby={`tab-${d.key}`}
          hidden={i !== index}
          onTouchStart={(e) => {
            const t = e.touches[0]!;
            start.current = { x: t.clientX, y: t.clientY };
          }}
          onTouchEnd={(e) => {
            const s = start.current;
            const t = e.changedTouches[0]!;
            start.current = null;
            if (!s) return;
            const dx = t.clientX - s.x;
            if (Math.abs(dx) > SWIPE && Math.abs(dx) > Math.abs(t.clientY - s.y))
              go(index + (dx < 0 ? 1 : -1));
          }}
        >
          {children[i]}
        </div>
      ))}
    </div>
  );
}
