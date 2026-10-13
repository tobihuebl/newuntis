'use client';
import { CalendarPlus, Copy } from 'lucide-react';
import { useState } from 'react';
import { BRAND } from '@sp/shared';
import { Button, Chip, Input, Sheet, useToast } from '@sp/ui';
import { apiRequest } from '../../lib/api-client';
import { useT } from '../../lib/i18n';
import { FormError } from '../form-bits';

/** Abo-Links der Kalender-Apps (nur Navigation durch Antippen, nichts wird von dort geladen). */
function appLinks(url: string, name: string) {
  const webcal = url.replace(/^https?:/, 'webcal:');
  return [
    { key: 'apple', href: webcal },
    {
      key: 'google',
      href: `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(webcal)}`,
    },
    {
      key: 'outlook',
      href: `https://outlook.live.com/calendar/0/addfromweb?url=${encodeURIComponent(url)}&name=${encodeURIComponent(name)}`,
    },
  ] as const;
}

/**
 * iCal-Feed (Design System, Stundenplan): Aktion "In Kalender abonnieren" öffnet ein Sheet mit Link-Kopieren und
 * Abo für Apple, Google und Outlook. Der Link wird nur direkt nach dem Erzeugen angezeigt.
 */
export function CalendarSubscription({
  csrfToken,
  active: initiallyActive,
}: {
  csrfToken: string;
  active: boolean;
}) {
  const t = useT('plan');
  const c = useT('common');
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState<string | null>(null);
  const [active, setActive] = useState(initiallyActive);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create() {
    setError(null);
    setBusy(true);
    try {
      const res = await apiRequest<{ url: string }>(
        'POST',
        '/me/calendar-token',
        undefined,
        csrfToken,
      );
      setUrl(res.url);
      setActive(true);
    } catch {
      setError(c('error'));
    } finally {
      setBusy(false);
    }
  }
  async function stop() {
    await apiRequest('DELETE', '/me/calendar-token', undefined, csrfToken).catch(() => undefined);
    setUrl(null);
    setActive(false);
    toast({ text: t('calendarStopped') });
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button variant="secondary" iconLeft={CalendarPlus} onClick={() => setOpen(true)}>
        {t('calendar')}
      </Button>
      {active ? <Chip tone="ok">{t('calendarOn')}</Chip> : null}
      <Sheet
        open={open}
        onOpenChange={setOpen}
        title={t('calendar')}
        description={t('calendarHelp')}
        closeLabel={c('close')}
      >
        {url ? (
          <>
            <Input
              label={t('calendarLink')}
              readOnly
              value={url}
              onFocus={(e) => e.currentTarget.select()}
            />
            <Button
              variant="secondary"
              iconLeft={Copy}
              className="self-start"
              onClick={async () => {
                await navigator.clipboard.writeText(url);
                toast({ text: t('calendarCopied') });
              }}
            >
              {t('calendarCopy')}
            </Button>
            <div className="flex flex-col gap-2">
              <p className="text-label">{t('calendarApps')}</p>
              <div className="flex flex-wrap gap-2">
                {appLinks(url, `${BRAND.name} ${t('title')}`).map((a) => (
                  <Button key={a.key} variant="secondary" size="sm" asChild>
                    <a
                      href={a.href}
                      target={a.key === 'apple' ? undefined : '_blank'}
                      rel="noreferrer"
                    >
                      {t(`calendarApp_${a.key}`)}
                    </a>
                  </Button>
                ))}
              </div>
            </div>
          </>
        ) : active ? (
          <p className="text-body-sm">{t('calendarActive')}</p>
        ) : null}
        {error ? <FormError message={error} /> : null}
        <div className="flex flex-wrap gap-2">
          {url ? null : (
            <Button
              variant={active ? 'secondary' : 'primary'}
              loading={busy}
              onClick={() => void create()}
            >
              {active ? t('calendarRenew') : t('calendarCreate')}
            </Button>
          )}
          {active ? (
            <Button variant="ghost" onClick={() => void stop()}>
              {t('calendarStop')}
            </Button>
          ) : null}
        </div>
      </Sheet>
    </div>
  );
}
