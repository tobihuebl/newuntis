'use client';
import { Lightbulb, X } from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { Button, cn } from '@sp/ui';
import { useT } from '../../lib/i18n';
import { useOnboarding, useStepUpdate, useStepViewed } from './use-onboarding';

const HIGHLIGHT = ['ring-3', 'ring-signal', 'rounded-md'];

/**
 * Coachmark (Onboarding, ADR 0020): Seiten mit ?tour=<Schritt> zeigen einen Hinweis am echten Element
 * (data-tour="…"). Am Computer neben dem Element, auf dem Handy als Leiste über der Tab-Leiste. Nicht modal;
 * "Verstanden" erledigt Schritte, die nur gezeigt werden; datengetriebene erledigen sich durch die Aktion selbst.
 */
export function Coachmark() {
  const t = useT('onboarding');
  const params = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const id = params.get('tour');
  const q = useOnboarding(id !== null);
  const update = useStepUpdate();
  const step = q.data?.steps.find((s) => s.id === id) ?? null;
  const card = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const { mutate } = update;
  const { mutate: viewed } = useStepViewed();
  const stepId = step?.id ?? null;
  const anchor = step?.anchor ?? null;

  // Nur von Id und Anker abhängig: ein neu geladener Stand darf den Hinweis nicht erneut auslösen
  useEffect(() => {
    if (!stepId) return;
    viewed({ stepId, status: 'VIEWED' });
    card.current?.focus();
    const target =
      anchor && anchor !== 'page'
        ? document.querySelector<HTMLElement>(`[data-tour="${anchor}"]`)
        : null;
    if (!target) {
      setPos(null);
      return;
    }
    target.scrollIntoView({ block: 'center', behavior: 'smooth' });
    target.classList.add(...HIGHLIGHT);
    const place = () => {
      const r = target.getBoundingClientRect();
      if (window.innerWidth < 1024) return setPos(null);
      setPos({
        top: Math.min(r.bottom + 12, window.innerHeight - 220),
        left: Math.max(16, Math.min(r.left, window.innerWidth - 400)),
      });
    };
    place();
    window.addEventListener('scroll', place, { passive: true });
    window.addEventListener('resize', place);
    return () => {
      target.classList.remove(...HIGHLIGHT);
      window.removeEventListener('scroll', place);
      window.removeEventListener('resize', place);
    };
  }, [stepId, anchor, viewed]);

  if (!step) return null;

  const close = () => {
    const rest = new URLSearchParams(params.toString());
    rest.delete('tour');
    const qs = rest.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };
  const ok = () => {
    if (!step.auto && step.status === 'OPEN') mutate({ stepId: step.id, status: 'DONE' });
    close();
  };

  return (
    <div
      ref={card}
      role="dialog"
      aria-modal="false"
      aria-labelledby="coachmark-h"
      tabIndex={-1}
      onKeyDown={(e) => e.key === 'Escape' && close()}
      style={pos ? { top: pos.top, left: pos.left } : undefined}
      className={cn(
        'fixed z-toast flex flex-col gap-3 rounded-lg bg-bg-night p-4 text-ink-on-night shadow-pop outline-none',
        pos
          ? 'w-96'
          : 'inset-x-3 bottom-[calc(var(--tabbar-h)+env(safe-area-inset-bottom)+var(--space-3))] lg:inset-x-auto lg:right-6 lg:bottom-6 lg:w-96',
      )}
    >
      <div className="flex items-start gap-3">
        <Lightbulb aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-signal" />
        <div className="flex flex-1 flex-col gap-1">
          <h2 id="coachmark-h" className="text-body-strong">
            {t(`tour_${step.id}_title`)}
          </h2>
          <p className="text-body-sm text-ink-on-night-muted">{t(`tour_${step.id}_text`)}</p>
        </div>
        <button
          type="button"
          onClick={close}
          aria-label={t('tourClose')}
          className="pf-focusable -mt-1 -mr-1 inline-flex size-(--tap-min) shrink-0 items-center justify-center rounded-md text-ink-on-night-muted hover:text-ink-on-night"
        >
          <X aria-hidden="true" className="size-5" />
        </button>
      </div>
      <Button size="sm" variant="signal" onClick={ok} className="self-start">
        {step.auto && step.status === 'OPEN' ? t('tourTry') : t('tourOk')}
      </Button>
    </div>
  );
}
