'use client';
import { Check, Circle, ListChecks } from 'lucide-react';
import Link from 'next/link';
import { useEffect } from 'react';
import { CHECKLIST_HIDDEN, type OnboardingStepState } from '@sp/shared';
import { Button, Card, cn } from '@sp/ui';
import { isStandalone } from '../../lib/install';
import { useT } from '../../lib/i18n';
import { tourHref, useOnboarding, useStepUpdate } from './use-onboarding';

/** Punkte der Checkliste: Aha-Moment zuerst, dann die weiteren ersten Schritte aller Rollen. */
function useChecklist() {
  const q = useOnboarding();
  const d = q.data;
  const items = (d?.steps ?? []).filter((s) => s.phase === 'aha' || s.phase === 'checklist');
  const open = items.filter((s) => s.status === 'OPEN');
  const show = !!d && !d.needsFlow && !d.checklistHidden && items.length > 0 && open.length > 0;
  return { items, open, show };
}

/** App installiert (Home-Bildschirm): Punkt der Checkliste der Schüler:innen erledigt sich selbst. */
function useInstallDone(items: OnboardingStepState[]) {
  const { mutate } = useStepUpdate();
  const pending = items.some((s) => s.id === 'studentInstall' && s.status === 'OPEN');
  // Erst im Browser messen: der Startwert von useInstall nimmt "installiert" an, um den Hinweis nicht aufblitzen zu lassen
  useEffect(() => {
    if (pending && isStandalone()) mutate({ stepId: 'studentInstall', status: 'DONE' });
  }, [pending, mutate]);
}

/** Checkliste "Erste Schritte" auf der Startseite; jeder Punkt führt mit Coachmark zur echten Stelle. */
export function ChecklistCard() {
  const t = useT('onboarding');
  const { items, open, show } = useChecklist();
  const update = useStepUpdate();
  useInstallDone(items);
  if (!show) return null;
  const done = items.length - open.length;
  return (
    <Card className="flex flex-col gap-4" data-tour="checklist">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-h3">
          <ListChecks aria-hidden="true" className="size-5 text-brand-text" />
          {t('checklistTitle')}
        </h2>
        <span className="text-label text-ink-muted">
          {t('checklistProgress', { done, total: items.length })}
        </span>
      </div>
      <div aria-hidden="true" className="flex gap-1">
        {items.map((s) => (
          <span
            key={s.id}
            className={cn(
              'h-2 flex-1 rounded-xs',
              s.status !== 'OPEN' ? 'bg-brand' : 'bg-bg-sunken',
            )}
          />
        ))}
      </div>
      <ul className="flex flex-col divide-y divide-line">
        {items.map((s) => {
          const href = tourHref(s);
          const settled = s.status !== 'OPEN';
          const label = (
            <>
              {settled ? (
                <Check aria-hidden="true" className="size-5 shrink-0 text-brand-text" />
              ) : (
                <Circle aria-hidden="true" className="size-5 shrink-0 text-ink-subtle" />
              )}
              <span className={cn('flex-1', settled && 'text-ink-muted line-through')}>
                {t(`title_${s.id}`)}
              </span>
              <span className="sr-only">{settled ? t('itemDone') : t('itemOpen')}</span>
            </>
          );
          return (
            <li key={s.id}>
              {href && !settled ? (
                <Link
                  href={href}
                  className="pf-focusable flex min-h-(--tap-min) items-center gap-3 rounded-md py-2 text-body hover:text-brand-text"
                >
                  {label}
                </Link>
              ) : (
                <span className="flex min-h-(--tap-min) items-center gap-3 py-2 text-body">
                  {label}
                </span>
              )}
            </li>
          );
        })}
      </ul>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          variant="ghost"
          loading={update.isPending}
          onClick={() => update.mutate({ stepId: CHECKLIST_HIDDEN, status: 'SKIPPED' })}
        >
          {t('checklistHide')}
        </Button>
        <Link
          href="/willkommen?wiederholen"
          className="pf-focusable ml-auto text-label text-brand-text underline underline-offset-4"
        >
          {t('helpTour')}
        </Link>
      </div>
    </Card>
  );
}

/** Kurzform in der Seitenleiste (Computer): Fortschritt und Weg zur Startseite mit der Liste. */
export function ChecklistProgress({ home }: { home: string }) {
  const t = useT('onboarding');
  const { items, open, show } = useChecklist();
  if (!show) return null;
  const done = items.length - open.length;
  return (
    <Link
      href={home}
      className="pf-focusable flex flex-col gap-2 rounded-lg bg-bg-night-raised p-3 text-ink-on-night"
    >
      <span className="flex items-center justify-between gap-2 text-label">
        {t('checklistTitle')}
        <span className="text-ink-on-night-muted">
          {t('checklistProgress', { done, total: items.length })}
        </span>
      </span>
      <span aria-hidden="true" className="flex gap-1">
        {items.map((s) => (
          <span
            key={s.id}
            className={cn(
              'h-1 flex-1 rounded-xs',
              s.status !== 'OPEN' ? 'bg-signal' : 'bg-bg-night',
            )}
          />
        ))}
      </span>
    </Link>
  );
}
