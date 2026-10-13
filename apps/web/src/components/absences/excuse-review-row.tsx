'use client';
import { Check, FileWarning } from 'lucide-react';
import { useRef, useState } from 'react';
import type { AbsenceItem } from '@sp/shared';
import { Button, Chip, cn } from '@sp/ui';
import { useT } from '../../lib/i18n';
import { AbsenceStatusBadge, AttachmentButton, absenceRange } from './absence-list';

/** Ab dieser Strecke (CSS-Pixel) entschuldigt ein Wisch nach rechts. */
export const SWIPE_THRESHOLD = 96;

/**
 * Wisch nach rechts auf Touch-Geräten (Design System, Screens 6). Senkrechtes Scrollen bleibt frei
 * (`touch-pan-y`); erst eine klar waagrechte Bewegung verschiebt die Zeile.
 */
function useSwipeRight(onSwipe: () => void) {
  const [dx, setDx] = useState(0);
  const start = useRef<{ x: number; y: number } | null>(null);
  const horizontal = useRef(false);
  const reset = () => {
    start.current = null;
    horizontal.current = false;
    setDx(0);
  };
  return {
    dx,
    handlers: {
      onPointerDown: (e: React.PointerEvent) => {
        if (e.pointerType !== 'touch') return;
        start.current = { x: e.clientX, y: e.clientY };
      },
      onPointerMove: (e: React.PointerEvent) => {
        if (!start.current) return;
        const mx = e.clientX - start.current.x;
        const my = e.clientY - start.current.y;
        if (!horizontal.current && Math.abs(mx) > 10 && Math.abs(mx) > Math.abs(my) * 1.5)
          horizontal.current = true;
        if (horizontal.current) setDx(Math.max(0, mx));
      },
      onPointerUp: () => {
        const done = horizontal.current && dx >= SWIPE_THRESHOLD;
        reset();
        if (done) onSwipe();
      },
      onPointerCancel: reset,
    },
  };
}

/**
 * Zeile "Zu prüfen" (Design System, Screens 6): Name, Zeitraum, Grund, Chip "Gemeldet"; Hauptaktion
 * "Entschuldigen", daneben "Mit Kommentar" (Sheet: Entschuldigen oder Ablehnen). Wischen nach rechts entschuldigt.
 */
export function ExcuseReviewRow({
  item: a,
  onExcuse,
  onComment,
  busy,
}: {
  item: AbsenceItem;
  onExcuse: () => void;
  onComment: () => void;
  busy?: boolean;
}) {
  const t = useT('klasse');
  const ta = useT('absence');
  const { dx, handlers } = useSwipeRight(onExcuse);
  const name = `${a.student.lastName} ${a.student.firstName}`;
  return (
    <li
      data-absence={a.status}
      className="relative overflow-hidden border-b border-line last:border-b-0"
    >
      {/* Fläche hinter der Zeile, sichtbar beim Wischen */}
      <div
        aria-hidden="true"
        className={cn(
          'absolute inset-0 flex items-center gap-2 px-4 text-label',
          dx >= SWIPE_THRESHOLD ? 'bg-brand text-on-brand' : 'bg-brand-soft text-brand-text',
        )}
      >
        <Check className="size-5" />
        {t('excuseNow')}
      </div>
      <div
        {...handlers}
        className={cn(
          'relative flex touch-pan-y flex-col gap-3 bg-bg-raised px-4 py-3 sm:flex-row sm:items-center',
          dx === 0 && 'ease-pf transition-transform duration-200',
        )}
        style={dx ? { transform: `translateX(${dx}px)` } : undefined}
      >
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <p className="text-body-strong">{name}</p>
          <p className="text-body-sm">
            {absenceRange(a)} · {ta('lessons', { n: a.lessons })}
          </p>
          {a.reasonCode || a.reason ? (
            <p className="text-body-sm text-ink-muted">
              {[a.reasonCode ? ta(`reasons.${a.reasonCode}`) : null, a.reason]
                .filter(Boolean)
                .join(' · ')}
            </p>
          ) : null}
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <AbsenceStatusBadge status={a.status} />
            {a.attachmentRequired && !a.hasAttachment ? (
              <Chip tone="late" icon={FileWarning}>
                {ta('attachmentMissing')}
              </Chip>
            ) : null}
            {a.hasAttachment ? <AttachmentButton absenceId={a.id} /> : null}
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <Button
            size="sm"
            iconLeft={Check}
            disabled={busy}
            onClick={onExcuse}
            aria-label={`${t('excuseNow')}: ${name}`}
          >
            {t('excuseNow')}
          </Button>
          <Button
            size="sm"
            variant="secondary"
            disabled={busy}
            onClick={onComment}
            aria-label={`${t('withComment')}: ${name}`}
          >
            {t('withComment')}
          </Button>
        </div>
      </div>
    </li>
  );
}
