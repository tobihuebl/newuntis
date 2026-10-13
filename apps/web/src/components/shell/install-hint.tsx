'use client';
import { MonitorDown, Share } from 'lucide-react';
import { useEffect } from 'react';
import { Button } from '@sp/ui';
import { useInstall } from '../../lib/install';
import { useT } from '../../lib/i18n';

/**
 * Installationshinweis (Design System, PWA): Kachel brand-soft "Auf dem Startbildschirm" mit "Installieren" und
 * "Nicht jetzt". In "Mehr" immer (bis "Nicht jetzt"), sonst einmalig nach der zweiten Sitzung. Kein modaler Zwang.
 */
export function InstallHint({ variant }: { variant: 'more' | 'once' }) {
  const t = useT('install');
  const s = useInstall();
  const show = variant === 'more' ? s.available && !s.dismissed : s.dueOnce;
  const { markShown } = s;
  useEffect(() => {
    if (show && variant === 'once') markShown();
  }, [show, variant, markShown]);
  if (!show) return null;
  return (
    <section
      aria-labelledby={`install-${variant}`}
      className="flex flex-col gap-3 rounded-lg bg-brand-soft p-4"
      data-install-hint={variant}
    >
      <div className="flex items-start gap-3">
        <MonitorDown aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-brand-text" />
        <div className="flex flex-col gap-1">
          <h2 id={`install-${variant}`} className="text-body-strong">
            {t('title')}
          </h2>
          <p className="text-body-sm">{s.ios ? t('iosText') : t('text')}</p>
          {s.ios ? (
            <p className="flex items-center gap-1 text-body-sm text-ink-muted">
              <Share aria-hidden="true" className="size-4" />
              {t('iosStep')}
            </p>
          ) : null}
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {s.ios ? null : (
          <Button size="sm" onClick={() => void s.install()}>
            {t('install')}
          </Button>
        )}
        <Button size="sm" variant="ghost" onClick={s.dismiss}>
          {t('later')}
        </Button>
      </div>
    </section>
  );
}
